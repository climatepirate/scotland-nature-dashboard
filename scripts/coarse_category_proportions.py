import csv
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

CATEGORY_ORDER = [
    "Business & Property Services",
    "Consumer & Visitor Economy",
    "Primary & Resource Industries",
    "Public & Community Services",
    "Unclassified",
]

CATEGORY_COLORS = {
    "Business & Property Services": "#6b6fae",
    "Consumer & Visitor Economy": "#3d8a95",
    "Primary & Resource Industries": "#d18b2f",
    "Public & Community Services": "#6c9b57",
    "Unclassified": "#9aa8a2",
}


def load_counts(csv_path: Path) -> Counter:
    counts = Counter()
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if "coarse_category" not in (reader.fieldnames or []):
            raise ValueError("Expected coarse_category column in input CSV")

        for row in reader:
            category = (row.get("coarse_category") or "").strip() or "Unclassified"
            if category not in CATEGORY_COLORS:
                category = "Unclassified"
            counts[category] += 1

    return counts


def plot_proportions(counts: Counter, output_path: Path) -> None:
    totals = [counts.get(category, 0) for category in CATEGORY_ORDER]
    grand_total = sum(totals)
    proportions = [(value / grand_total * 100.0) if grand_total else 0.0 for value in totals]

    fig, ax = plt.subplots(figsize=(10.5, 5.5))
    bars = ax.barh(
        CATEGORY_ORDER,
        proportions,
        color=[CATEGORY_COLORS[category] for category in CATEGORY_ORDER],
        edgecolor="#2f3e3b",
        linewidth=0.5,
    )

    for bar, proportion, count in zip(bars, proportions, totals):
        ax.text(
            bar.get_width() + 0.45,
            bar.get_y() + bar.get_height() / 2,
            f"{proportion:.2f}% ({count:,})",
            va="center",
            ha="left",
            fontsize=10,
            color="#1f2b2a",
        )

    ax.set_xlim(0, max(proportions) * 1.22 if proportions else 1)
    ax.set_xlabel("Proportion of businesses (%)", fontsize=11)
    ax.set_title(
        "Coarse Category Proportions Across Scottish Businesses in Study",
        fontsize=13,
        pad=12,
    )
    ax.grid(axis="x", linestyle="--", alpha=0.25)
    ax.invert_yaxis()

    subtitle = (
        f"Source: Data/dashboard_master.csv | Total businesses: {grand_total:,} "
        "| Inclusion: all rows in study dataset"
    )
    fig.text(0.5, 0.01, subtitle, ha="center", va="bottom", fontsize=9, color="#4d5d5a")

    plt.tight_layout(rect=[0, 0.04, 1, 1])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=180)
    plt.close(fig)


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    csv_path = project_root / "Data" / "dashboard_master.csv"
    output_path = project_root / "Data" / "runtime_checks" / "coarse_category_proportions.png"

    counts = load_counts(csv_path)
    plot_proportions(counts, output_path)

    print("Saved chart:", output_path)
    for category in CATEGORY_ORDER:
        print(f"{category}: {counts.get(category, 0):,}")


if __name__ == "__main__":
    main()
