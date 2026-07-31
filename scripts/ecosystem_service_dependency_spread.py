import csv
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

BAR_COLOR = "#2f7bbd"


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


def aggregate_dependency_spread(long_path: Path, scorable_companies):
    # Keep one boolean per company-service pair: any dependency value >= 2 (includes Low+).
    has_any_dependency = {}

    with long_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = normalize_company_id(row.get("company_id"))
            if company_id not in scorable_companies:
                continue

            service = str(row.get("Ecosystem Service") or "").strip()
            if not service:
                continue

            value = parse_float(row.get("Dependency_value_for_analysis"))
            if value is None:
                continue

            key = (company_id, service)
            if key not in has_any_dependency:
                has_any_dependency[key] = value >= 2.0
            else:
                has_any_dependency[key] = has_any_dependency[key] or (value >= 2.0)

    company_count_by_service = defaultdict(int)
    for (company_id, service), flag in has_any_dependency.items():
        if flag:
            company_count_by_service[service] += 1

    rows = [
        {
            "service": service,
            "company_count": count,
        }
        for service, count in company_count_by_service.items()
    ]

    rows.sort(key=lambda row: row["company_count"], reverse=True)
    return rows


def plot_spread(rows, output_path: Path):
    labels = [row["service"] for row in rows]
    values = [row["company_count"] for row in rows]

    fig_height = max(7.5, len(rows) * 0.45)
    fig, ax = plt.subplots(figsize=(14, fig_height))

    bars = ax.barh(labels, values, color=BAR_COLOR, edgecolor="#1f2b2a", linewidth=0.4)

    max_value = max(values) if values else 1
    for bar, value in zip(bars, values):
        ax.text(
            bar.get_width() + (max_value * 0.008),
            bar.get_y() + bar.get_height() / 2,
            f"{value:,}",
            va="center",
            ha="left",
            fontsize=9,
            color="#1f2b2a",
        )

    ax.set_title("Ecosystem Services by Number of Businesses with Any Dependency", fontsize=14, pad=12)
    ax.set_xlabel("Number of businesses (any dependency, including Low)", fontsize=11)
    ax.set_ylabel("Ecosystem service", fontsize=11)
    ax.grid(axis="x", linestyle="--", alpha=0.25)
    ax.invert_yaxis()
    ax.set_xlim(0, max_value * 1.18 if values else 1)

    fig.text(
        0.5,
        0.01,
        "Source: Data/company_ecosystem_service_long.csv | Scorable companies only | "
        "Any dependency rule: Dependency_value_for_analysis >= 2",
        ha="center",
        va="bottom",
        fontsize=9,
        color="#4d5d5a",
    )

    plt.tight_layout(rect=[0, 0.03, 1, 1])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=180)
    plt.close(fig)


def main():
    project_root = Path(__file__).resolve().parents[1]
    dashboard_master = project_root / "Data" / "dashboard_master.csv"
    service_long = project_root / "Data" / "company_ecosystem_service_long.csv"
    output_path = project_root / "Data" / "runtime_checks" / "ecosystem_service_dependency_spread_business_count.png"

    scorable_companies = load_scorable_companies(dashboard_master)
    rows = aggregate_dependency_spread(service_long, scorable_companies)
    plot_spread(rows, output_path)

    print("Saved chart:", output_path)
    print("Top 8 most depended-on services:")
    for row in rows[:8]:
        print(f"{row['service']}: {row['company_count']:,}")
    print("\nBottom 8 least depended-on services:")
    for row in rows[-8:]:
        print(f"{row['service']}: {row['company_count']:,}")


if __name__ == "__main__":
    main()
