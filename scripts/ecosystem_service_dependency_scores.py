import csv
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

DEPENDENCY_COLOR = "#2f7bbd"
DEPENDENCY_COLOR_LIGHT = "#78a9dc"


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


def aggregate_service_dependency(long_path: Path, scorable_companies):
    # Deduplicate repeated company-service rows by keeping the maximum dependency
    # value for each company-service pair.
    company_service_score = {}

    with long_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = normalize_company_id(row.get("company_id"))
            if company_id not in scorable_companies:
                continue

            service = str(row.get("Ecosystem Service") or "").strip()
            if not service:
                continue

            dependency_value = parse_float(row.get("Dependency_value_for_analysis"))
            if dependency_value is None:
                continue

            key = (company_id, service)
            previous = company_service_score.get(key)
            if previous is None or dependency_value > previous:
                company_service_score[key] = dependency_value

    total_by_service = defaultdict(float)
    companies_by_service = defaultdict(int)
    for (company_id, service), dependency_value in company_service_score.items():
        total_by_service[service] += dependency_value
        companies_by_service[service] += 1

    total_companies = len(scorable_companies)
    rows = []
    for service, total_value in total_by_service.items():
        per_company_all = (total_value / total_companies) if total_companies else 0.0
        rows.append(
            {
                "service": service,
                "dependency_total": total_value,
                "dependency_per_company": per_company_all,
                "companies_with_service": companies_by_service.get(service, 0),
            }
        )

    return rows, total_companies


def plot_horizontal(rows, metric_key, title, xlabel, color, subtitle, output_path):
    sorted_rows = sorted(rows, key=lambda row: row[metric_key], reverse=True)

    labels = [row["service"] for row in sorted_rows]
    values = [row[metric_key] for row in sorted_rows]

    fig_height = max(7.5, len(sorted_rows) * 0.45)
    fig, ax = plt.subplots(figsize=(13.8, fig_height))

    bars = ax.barh(labels, values, color=color, edgecolor="#1f2b2a", linewidth=0.4)

    max_value = max(values) if values else 1
    for bar, value in zip(bars, values):
        if metric_key == "dependency_total":
            label = f"{value:,.0f}"
        else:
            label = f"{value:.2f}"

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
    ax.set_ylabel("Ecosystem service", fontsize=11)
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
    long_path = project_root / "Data" / "company_ecosystem_service_long.csv"

    output_total = project_root / "Data" / "runtime_checks" / "ecosystem_service_dependency_total.png"
    output_per_company = project_root / "Data" / "runtime_checks" / "ecosystem_service_dependency_per_company.png"

    scorable_companies = load_scorable_companies(dashboard_master_path)
    rows, total_companies = aggregate_service_dependency(long_path, scorable_companies)

    plot_horizontal(
        rows=rows,
        metric_key="dependency_total",
        title="Ecosystem Services by Total Dependency Score (All Businesses)",
        xlabel="Total dependency score (sum across businesses)",
        color=DEPENDENCY_COLOR,
        subtitle=(
            "Source: Data/company_ecosystem_service_long.csv | "
            "Scorable companies only | One score per company-service pair (max where duplicates)"
        ),
        output_path=output_total,
    )

    plot_horizontal(
        rows=rows,
        metric_key="dependency_per_company",
        title="Ecosystem Services by Dependency Score per Company (Proportion-Normalised)",
        xlabel="Dependency score per company (total dependency / all scorable companies)",
        color=DEPENDENCY_COLOR_LIGHT,
        subtitle=(
            f"Normalised by all scorable companies (n={total_companies:,}) | "
            "Scorable companies only | One score per company-service pair (max where duplicates)"
        ),
        output_path=output_per_company,
    )

    print("Saved chart:", output_total)
    print("Saved chart:", output_per_company)
    top_total = sorted(rows, key=lambda row: row["dependency_total"], reverse=True)[:8]
    print("\nTop 8 services by total dependency score:")
    for row in top_total:
        print(
            f"{row['service']}: total={row['dependency_total']:,.0f}, "
            f"per_company={row['dependency_per_company']:.2f}, companies_with_service={row['companies_with_service']:,}"
        )


if __name__ == "__main__":
    main()
