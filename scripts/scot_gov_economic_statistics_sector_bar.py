import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

BAR_COLOR = "#3d8a95"


def load_rows(json_path: Path):
    payload = json.loads(json_path.read_text(encoding="utf-8"))
    rows = payload.get("rows", []) if isinstance(payload, dict) else []

    cleaned = []
    for row in rows:
        sector = str(row.get("governmentIndustryLabel") or "").strip()
        output = row.get("annualOutputBn")
        if not sector or output is None:
            continue
        cleaned.append({
            "sector": sector,
            "annualOutputBn": float(output),
            "employmentFte": float(row.get("employmentFte") or 0.0),
        })

    cleaned.sort(key=lambda item: item["annualOutputBn"], reverse=True)
    return cleaned


def plot_vertical(rows, output_path: Path):
    labels = [row["sector"] for row in rows]
    values = [row["annualOutputBn"] for row in rows]

    fig, ax = plt.subplots(figsize=(13.5, 7.5))
    bars = ax.bar(labels, values, color=BAR_COLOR, edgecolor="#1f2b2a", linewidth=0.5)

    max_value = max(values) if values else 1
    for bar, value in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            value + (max_value * 0.015),
            f"{value:.1f}",
            ha="center",
            va="bottom",
            fontsize=9,
            color="#1f2b2a",
        )

    ax.set_title("Scottish Government Economic Statistics by Sector", fontsize=15, pad=12)
    ax.set_xlabel("Sector", fontsize=11)
    ax.set_ylabel("Annual output (£bn)", fontsize=11)
    ax.grid(axis="y", linestyle="--", alpha=0.25)
    ax.set_ylim(0, max_value * 1.16 if values else 1)
    ax.tick_params(axis="x", labelrotation=35)

    fig.text(
        0.5,
        0.01,
        "Source: Data/scottish_economic_statistics.validated.json | Metric: annualOutputBn",
        ha="center",
        va="bottom",
        fontsize=9,
        color="#4d5d5a",
    )

    plt.tight_layout(rect=[0, 0.04, 1, 1])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=180)
    plt.close(fig)


def main():
    project_root = Path(__file__).resolve().parents[1]
    input_path = project_root / "Data" / "scottish_economic_statistics.validated.json"
    output_path = project_root / "Data" / "runtime_checks" / "scot_gov_economic_statistics_sector_vertical.png"

    rows = load_rows(input_path)
    plot_vertical(rows, output_path)

    print("Saved chart:", output_path)
    print("Sectors plotted:", len(rows))
    for row in rows:
        print(f"{row['sector']}: £{row['annualOutputBn']:.1f}bn")


if __name__ == "__main__":
    main()
