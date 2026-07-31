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
BAR_COLOR = "#3d8a95"
EDGE_COLOR = "#1f2b2a"


def load_counts(filter_index_path: Path):
    payload = json.loads(filter_index_path.read_text(encoding="utf-8"))
    buckets = payload.get("buckets", {})
    local_authorities = payload.get("local_authorities", [])

    rows = []
    for entry in local_authorities:
        code = entry.get("code") if isinstance(entry, dict) else str(entry)
        if not code:
            continue

        bucket = buckets.get(f"{code}||{ALL_CATEGORIES}", {})
        company_count = int(bucket.get("company_count", 0) or 0)
        name = LOCAL_AUTHORITY_NAME_BY_CODE.get(code, code)
        rows.append((name, company_count))

    rows.sort(key=lambda item: item[1], reverse=True)
    return rows


def build_chart(rows, output_path: Path):
    names = [row[0] for row in rows]
    counts = [row[1] for row in rows]
    total = sum(counts)

    fig_height = max(8.5, len(rows) * 0.38)
    fig, ax = plt.subplots(figsize=(12.5, fig_height))

    bars = ax.barh(names, counts, color=BAR_COLOR, edgecolor=EDGE_COLOR, linewidth=0.45)

    max_count = max(counts) if counts else 1
    for bar, count in zip(bars, counts):
        ax.text(
            bar.get_width() + (max_count * 0.008),
            bar.get_y() + bar.get_height() / 2,
            f"{count:,}",
            va="center",
            ha="left",
            fontsize=9,
            color="#1f2b2a",
        )

    ax.set_title("Number of Companies per Local Authority", fontsize=15, pad=12)
    ax.set_xlabel("Number of companies", fontsize=11)
    ax.set_ylabel("Local authority", fontsize=11)
    ax.grid(axis="x", linestyle="--", alpha=0.25)
    ax.invert_yaxis()
    ax.set_xlim(0, max_count * 1.16 if counts else 1)

    fig.text(
        0.5,
        0.01,
        f"Source: Data/dashboard_filter_index.json | Total businesses: {total:,} | Bucket: code||All Categories",
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
    filter_index_path = project_root / "Data" / "dashboard_filter_index.json"
    output_path = project_root / "Data" / "runtime_checks" / "local_authority_company_counts.png"

    rows = load_counts(filter_index_path)
    build_chart(rows, output_path)

    print("Saved chart:", output_path)
    for name, count in rows[:10]:
        print(f"{name}: {count:,}")


if __name__ == "__main__":
    main()
