import csv
from collections import defaultdict
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

LOCAL_AUTHORITY_NAME_BY_CODE = {
    "S12000033": "Aberdeen City",
    "S12000034": "Aberdeenshire",
    "S12000041": "Angus",
    "S12000035": "Argyll and Bute",
    "S12000036": "City of Edinburgh",
    "S12000005": "Clackmannanshire",
    "S12000006": "Dumfries and Galloway",
    "S12000042": "Dundee City",
    "S12000008": "East Ayrshire",
    "S12000045": "East Dunbartonshire",
    "S12000010": "East Lothian",
    "S12000011": "East Renfrewshire",
    "S12000013": "Eilean Siar",
    "S12000014": "Falkirk",
    "S12000047": "Fife",
    "S12000049": "Glasgow City",
    "S12000017": "Highland",
    "S12000018": "Inverclyde",
    "S12000019": "Midlothian",
    "S12000020": "Moray",
    "S12000021": "North Ayrshire",
    "S12000050": "North Lanarkshire",
    "S12000023": "Orkney Islands",
    "S12000048": "Perth and Kinross",
    "S12000038": "Renfrewshire",
    "S12000026": "Scottish Borders",
    "S12000027": "Shetland Islands",
    "S12000028": "South Ayrshire",
    "S12000029": "South Lanarkshire",
    "S12000030": "Stirling",
    "S12000039": "West Dunbartonshire",
    "S12000040": "West Lothian",
}

DEPENDENCY_COLOR = "#2f7bbd"
PRESSURE_COLOR = "#f05a5a"


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


def load_local_authority_by_company(dashboard_master_path: Path):
    authority_by_company = {}
    with dashboard_master_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = normalize_company_id(row.get("company_id"))
            authority_code = str(row.get("local_authority_code") or "").strip()
            if not company_id or not authority_code:
                continue
            authority_by_company[company_id] = authority_code

    return authority_by_company


def aggregate_totals(company_master_path: Path, authority_by_company):
    dep_sum_by_authority = defaultdict(float)
    pressure_sum_by_authority = defaultdict(float)
    dep_count_by_authority = defaultdict(int)
    pressure_count_by_authority = defaultdict(int)

    with company_master_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            company_id = normalize_company_id(row.get("company_id"))
            authority_code = authority_by_company.get(company_id)
            if not authority_code:
                continue

            dep_score = parse_float(row.get("dep_score"))
            pressure_score = parse_float(row.get("press_score"))

            if dep_score is not None:
                dep_sum_by_authority[authority_code] += dep_score
                dep_count_by_authority[authority_code] += 1

            if pressure_score is not None:
                pressure_sum_by_authority[authority_code] += pressure_score
                pressure_count_by_authority[authority_code] += 1

    rows = []
    authority_codes = set(dep_sum_by_authority.keys()) | set(pressure_sum_by_authority.keys())
    for code in authority_codes:
        dep_total = dep_sum_by_authority.get(code, 0.0)
        pressure_total = pressure_sum_by_authority.get(code, 0.0)
        combined_total = dep_total + pressure_total
        rows.append(
            {
                "code": code,
                "name": LOCAL_AUTHORITY_NAME_BY_CODE.get(code, code),
                "dependency_total": dep_total,
                "pressure_total": pressure_total,
                "combined_total": combined_total,
                "dependency_n": dep_count_by_authority.get(code, 0),
                "pressure_n": pressure_count_by_authority.get(code, 0),
            }
        )

    rows.sort(key=lambda row: row["combined_total"], reverse=True)
    return rows


def build_chart(rows, output_path: Path):
    names = [row["name"] for row in rows]
    dep_totals = [row["dependency_total"] for row in rows]
    pressure_totals = [row["pressure_total"] for row in rows]
    combined_totals = [row["combined_total"] for row in rows]

    fig_height = max(8.5, len(rows) * 0.38)
    fig, ax = plt.subplots(figsize=(13.8, fig_height))

    ax.barh(
        names,
        dep_totals,
        color=DEPENDENCY_COLOR,
        edgecolor="#1f2b2a",
        linewidth=0.4,
        label="Total dependency score (sum)",
    )

    pressure_bars = ax.barh(
        names,
        pressure_totals,
        left=dep_totals,
        color=PRESSURE_COLOR,
        edgecolor="#1f2b2a",
        linewidth=0.4,
        label="Total pressure score (sum)",
    )

    max_combined = max(combined_totals) if combined_totals else 1
    for bar, combined in zip(pressure_bars, combined_totals):
        ax.text(
            bar.get_x() + bar.get_width() + max_combined * 0.006,
            bar.get_y() + bar.get_height() / 2,
            f"{combined:,.0f}",
            va="center",
            ha="left",
            fontsize=8.5,
            color="#1f2b2a",
        )

    ax.set_title(
        "Local Authority Total Dependency + Pressure Scores (Stacked, Sorted by Combined Total)",
        fontsize=14,
        pad=12,
    )
    ax.set_xlabel("Total score (sum across businesses)", fontsize=11)
    ax.set_ylabel("Local authority", fontsize=11)
    ax.grid(axis="x", linestyle="--", alpha=0.25)
    ax.invert_yaxis()
    ax.set_xlim(0, max_combined * 1.16 if combined_totals else 1)
    ax.legend(loc="lower right", frameon=False)

    fig.text(
        0.5,
        0.01,
        "Source: Data/company_master.csv + Data/dashboard_master.csv | "
        "Join key: company_id | Metric totals: sum(dep_score) + sum(press_score)",
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
    dashboard_master_path = project_root / "Data" / "dashboard_master.csv"
    company_master_path = project_root / "Data" / "company_master.csv"
    output_path = project_root / "Data" / "runtime_checks" / "local_authority_dependency_pressure_totals_stacked.png"

    authority_by_company = load_local_authority_by_company(dashboard_master_path)
    rows = aggregate_totals(company_master_path, authority_by_company)
    build_chart(rows, output_path)

    print("Saved chart:", output_path)
    print("Top 10 by combined total:")
    for row in rows[:10]:
        print(
            f"{row['name']}: combined={row['combined_total']:,.0f}, "
            f"dependency={row['dependency_total']:,.0f}, pressure={row['pressure_total']:,.0f}, "
            f"dep_n={row['dependency_n']:,}, pressure_n={row['pressure_n']:,}"
        )


if __name__ == "__main__":
    main()
