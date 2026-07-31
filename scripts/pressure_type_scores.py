import csv
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

PRESSURE_COLOR = "#f05a5a"
PRESSURE_COLOR_LIGHT = "#f6a7a7"


def normalize_company_id(value: str) -> str:
    text = str(value or "").strip()
    if text.endswith(".0"):
        text = text[:-2]
    return text


def parse_float(value: str):
    try:
        number = float(str(value or "").strip())
        if number == number:
            return number
    except ValueError:
        return None
    return None


def load_scorable_companies(dashboard_master_path: Path):
    scorable = set()
    with dashboard_master_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if str(row.get("scorable_flag", "")).strip().lower() != "true":
                continue
            company_id = normalize_company_id(row.get("company_id"))
            if company_id:
                scorable.add(company_id)
    return scorable


def aggregate_pressure_scores(long_path: Path, scorable_companies):
    # Deduplicate repeated company-pressure rows by keeping maximum value.
    company_pressure_score = {}

    with long_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = normalize_company_id(row.get("company_id"))
            if company_id not in scorable_companies:
                continue

            pressure_type = str(row.get("Pressure") or "").strip()
            if not pressure_type:
                continue

            pressure_value = parse_float(row.get("Pressure_value_for_analysis"))
            if pressure_value is None:
                continue

            key = (company_id, pressure_type)
            previous = company_pressure_score.get(key)
            if previous is None or pressure_value > previous:
                company_pressure_score[key] = pressure_value

    total_by_pressure = defaultdict(float)
    companies_by_pressure = defaultdict(int)

    for (company_id, pressure_type), pressure_value in company_pressure_score.items():
        total_by_pressure[pressure_type] += pressure_value
        companies_by_pressure[pressure_type] += 1

    total_companies = len(scorable_companies)
    rows = []
    for pressure_type, total_value in total_by_pressure.items():
        per_company_all = (total_value / total_companies) if total_companies else 0.0
        rows.append(
            {
                "pressure_type": pressure_type,
                "pressure_total": total_value,
                "pressure_per_company": per_company_all,
                "companies_with_pressure": companies_by_pressure.get(pressure_type, 0),
            }
        )

    return rows, total_companies


def plot_horizontal(rows, metric_key, title, xlabel, color, subtitle, output_path):
    sorted_rows = sorted(rows, key=lambda row: row[metric_key], reverse=True)

    labels = [row["pressure_type"] for row in sorted_rows]
    values = [row[metric_key] for row in sorted_rows]

    fig_height = max(7.5, len(sorted_rows) * 0.45)
    fig, ax = plt.subplots(figsize=(14, fig_height))

    bars = ax.barh(labels, values, color=color, edgecolor="#1f2b2a", linewidth=0.4)

    max_value = max(values) if values else 1
    for bar, value in zip(bars, values):
        label = f"{value:,.0f}" if metric_key == "pressure_total" else f"{value:.2f}"
        ax.text(
            bar.get_width() + (max_value * 0.008),
            bar.get_y() + bar.get_height() / 2,
            label,
            va="center",
            ha="left",
            fontsize=9,
            color="#1f2b2a",
        )

    ax.set_title(title, fontsize=14, pad=12)
    ax.set_xlabel(xlabel, fontsize=11)
    ax.set_ylabel("Pressure type", fontsize=11)
    ax.grid(axis="x", linestyle="--", alpha=0.25)
    ax.invert_yaxis()
    ax.set_xlim(0, max_value * 1.18 if values else 1)

    fig.text(0.5, 0.01, subtitle, ha="center", va="bottom", fontsize=9, color="#4d5d5a")

    plt.tight_layout(rect=[0, 0.03, 1, 1])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=180)
    plt.close(fig)


def main():
    project_root = Path(__file__).resolve().parents[1]
    dashboard_master_path = project_root / "Data" / "dashboard_master.csv"
    long_path = project_root / "Data" / "company_pressure_long.csv"

    output_total = project_root / "Data" / "runtime_checks" / "pressure_type_total.png"
    output_per_company = project_root / "Data" / "runtime_checks" / "pressure_type_per_company.png"

    scorable_companies = load_scorable_companies(dashboard_master_path)
    rows, total_companies = aggregate_pressure_scores(long_path, scorable_companies)

    plot_horizontal(
        rows=rows,
        metric_key="pressure_total",
        title="Pressure Types by Total Pressure Score (All Businesses)",
        xlabel="Total pressure score (sum across businesses)",
        color=PRESSURE_COLOR,
        subtitle=(
            "Source: Data/company_pressure_long.csv | "
            "Scorable companies only | One score per company-pressure pair (max where duplicates)"
        ),
        output_path=output_total,
    )

    plot_horizontal(
        rows=rows,
        metric_key="pressure_per_company",
        title="Pressure Types by Pressure Score per Company (Proportion-Normalised)",
        xlabel="Pressure score per company (total pressure / all scorable companies)",
        color=PRESSURE_COLOR_LIGHT,
        subtitle=(
            f"Normalised by all scorable companies (n={total_companies:,}) | "
            "Scorable companies only | One score per company-pressure pair (max where duplicates)"
        ),
        output_path=output_per_company,
    )

    print("Saved chart:", output_total)
    print("Saved chart:", output_per_company)
    top_total = sorted(rows, key=lambda row: row["pressure_total"], reverse=True)[:8]
    print("\nTop 8 pressure types by total pressure score:")
    for row in top_total:
        print(
            f"{row['pressure_type']}: total={row['pressure_total']:,.0f}, "
            f"per_company={row['pressure_per_company']:.2f}, companies_with_pressure={row['companies_with_pressure']:,}"
        )


if __name__ == "__main__":
    main()
