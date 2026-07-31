import json
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

ALL_CATEGORIES = "All Categories"
DEPENDENCY_COLOR = "#2f7bbd"
PRESSURE_COLOR = "#f05a5a"


def load_rows(statistics_path: Path):
    payload = json.loads(statistics_path.read_text(encoding="utf-8"))
    buckets = payload.get("buckets", {})

    rows = []
    for bucket_key, bucket in buckets.items():
        parts = str(bucket_key).split("||", 1)
        if len(parts) != 2:
            continue
        code, category = parts
        if category != ALL_CATEGORIES or code == "All Scotland":
            continue

        company_count = int(bucket.get("company_count", 0) or 0)
        if company_count <= 0:
            continue

        dependency_count = int(bucket.get("moderate_high_dependency_count", 0) or 0)
        pressure_count = int(bucket.get("moderate_high_pressure_count", 0) or 0)

        dependency_score = (dependency_count / company_count) * 100.0
        pressure_score = (pressure_count / company_count) * 100.0
        combined_score = dependency_score + pressure_score

        rows.append(
            {
                "code": code,
                "name": LOCAL_AUTHORITY_NAME_BY_CODE.get(code, code),
                "company_count": company_count,
                "dependency_score": dependency_score,
                "pressure_score": pressure_score,
                "combined_score": combined_score,
            }
        )

    rows.sort(key=lambda row: row["combined_score"], reverse=True)
    return rows


def build_chart(rows, output_path: Path):
    names = [row["name"] for row in rows]
    dep_scores = [row["dependency_score"] for row in rows]
    pressure_scores = [row["pressure_score"] for row in rows]
    combined_scores = [row["combined_score"] for row in rows]

    fig_height = max(8.5, len(rows) * 0.38)
    fig, ax = plt.subplots(figsize=(13.5, fig_height))

    dep_bars = ax.barh(
        names,
        dep_scores,
        color=DEPENDENCY_COLOR,
        edgecolor="#1f2b2a",
        linewidth=0.4,
        label="Dependency score (%)",
    )

    pressure_bars = ax.barh(
        names,
        pressure_scores,
        left=dep_scores,
        color=PRESSURE_COLOR,
        edgecolor="#1f2b2a",
        linewidth=0.4,
        label="Pressure score (%)",
    )

    max_combined = max(combined_scores) if combined_scores else 1
    for bar, combined in zip(pressure_bars, combined_scores):
        ax.text(
            bar.get_x() + bar.get_width() + max_combined * 0.01,
            bar.get_y() + bar.get_height() / 2,
            f"{combined:.1f}",
            va="center",
            ha="left",
            fontsize=8.5,
            color="#1f2b2a",
        )

    ax.set_title(
        "Local Authority Dependency + Pressure Scores (Stacked, Sorted by Combined Score)",
        fontsize=14,
        pad=12,
    )
    ax.set_xlabel("Score (% of companies with Moderate-High to Very High levels)", fontsize=11)
    ax.set_ylabel("Local authority", fontsize=11)
    ax.grid(axis="x", linestyle="--", alpha=0.25)
    ax.invert_yaxis()
    ax.set_xlim(0, max_combined * 1.2 if combined_scores else 1)
    ax.legend(loc="lower right", frameon=False)

    fig.text(
        0.5,
        0.01,
        "Source: Data/dashboard_statistics_panel.json | Bucket: code||All Categories | "
        "Combined score = dependency% + pressure%",
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
    stats_path = project_root / "Data" / "dashboard_statistics_panel.json"
    output_path = project_root / "Data" / "runtime_checks" / "local_authority_dependency_pressure_stacked.png"

    rows = load_rows(stats_path)
    build_chart(rows, output_path)

    print("Saved chart:", output_path)
    print("Top 10 by combined score:")
    for row in rows[:10]:
        print(
            f"{row['name']}: combined={row['combined_score']:.1f}, "
            f"dependency={row['dependency_score']:.1f}, pressure={row['pressure_score']:.1f}, "
            f"companies={row['company_count']:,}"
        )


if __name__ == "__main__":
    main()
