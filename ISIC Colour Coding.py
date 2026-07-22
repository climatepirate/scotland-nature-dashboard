import numpy as np
from qgis.core import (
    QgsProject,
    QgsRuleBasedRenderer,
    QgsSymbol
)
from qgis.PyQt.QtGui import QColor

# ============================================================
# SETTINGS
# ============================================================

layer_prefix = "ISIC_"

# 70% transparent = 30% visible fill
# If this is too pale, try 0.45 or 0.55
fill_opacity = 0.7

# Hex grid outline visibility
outline_colour = QColor(70, 70, 70, 170)
outline_width = 0.12

# Non-linear percentile breaks
# Lots of classes at the top end so high density areas stand out.
percentile_breaks = [0, 40, 50, 60, 65, 75, 85, 88, 90, 94, 96, 98, 99, 99.5, 100]

# Higher gamma keeps low values pale and makes only high values dark.
colour_gamma = 0.8

# Different colour ramps for each ISIC layer
colour_sets = [
    ("#fff7f7", "#7f0000"),  # red
    ("#f7fbff", "#08306b"),  # blue
    ("#f7fcf5", "#00441b"),  # green
    ("#fcfbfd", "#4a1486"),  # purple
    ("#fff5eb", "#7f2704"),  # orange/brown
    ("#f7f7f7", "#252525"),  # grey
    ("#ffffe5", "#8c2d04"),  # yellow/orange
    ("#f0f9e8", "#08589e"),  # green/blue
    ("#fde0dd", "#c51b8a"),  # pink
    ("#edf8fb", "#006d2c"),  # teal/green
    ("#fff7bc", "#b30000"),  # yellow/red
    ("#f1eef6", "#980043"),  # lavender/magenta
]


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def quote_field(field_name):
    return '"' + field_name.replace('"', '\\"') + '"'


def interpolate_colour(start_hex, end_hex, t, opacity):
    start = QColor(start_hex)
    end = QColor(end_hex)

    r = start.red() + (end.red() - start.red()) * t
    g = start.green() + (end.green() - start.green()) * t
    b = start.blue() + (end.blue() - start.blue()) * t
    a = int(255 * opacity)

    return QColor(int(r), int(g), int(b), a)


def make_symbol(layer, fill_colour, fill_opacity_value, outline=True):
    symbol = QgsSymbol.defaultSymbol(layer.geometryType())

    symbol.setColor(fill_colour)
    symbol.setOpacity(1.0)

    if symbol.symbolLayerCount() > 0:
        if outline:
            symbol.symbolLayer(0).setStrokeColor(outline_colour)
            symbol.symbolLayer(0).setStrokeWidth(outline_width)
        else:
            symbol.symbolLayer(0).setStrokeColor(QColor(0, 0, 0, 0))
            symbol.symbolLayer(0).setStrokeWidth(0)

    return symbol


def make_null_symbol(layer):
    # transparent fill, visible outline
    colour = QColor(255, 255, 255, 0)
    symbol = QgsSymbol.defaultSymbol(layer.geometryType())
    symbol.setColor(colour)
    symbol.setOpacity(1.0)

    if symbol.symbolLayerCount() > 0:
        symbol.symbolLayer(0).setStrokeColor(outline_colour)
        symbol.symbolLayer(0).setStrokeWidth(outline_width)

    return symbol


# ============================================================
# GET ISIC LAYERS
# ============================================================

project = QgsProject.instance()

isic_layers = [
    layer for layer in project.mapLayers().values()
    if layer.name().startswith(layer_prefix)
]

print("ISIC layers found:", len(isic_layers))

for layer in isic_layers:
    print("-", layer.name())


# ============================================================
# APPLY STYLE TO EACH ISIC LAYER
# ============================================================

for i, layer in enumerate(isic_layers):

    # Find the sector count field in the joined hex layer
    candidate_fields = [
        field.name()
        for field in layer.fields()
        if "count_isic" in field.name().lower()
        and (
            "sum" in field.name().lower()
            or field.name().lower().startswith("count_isic")
        )
    ]

    if not candidate_fields:
        print(f"Skipping {layer.name()} — no ISIC count field found")
        continue

    value_field = candidate_fields[0]
    value_field_q = quote_field(value_field)

    print(f"\nStyling layer: {layer.name()}")
    print(f"Using field: {value_field}")

    # Extract positive values only for classification
    values = []

    for feature in layer.getFeatures():
        v = feature[value_field]

        if v is None:
            continue

        try:
            v = float(v)
        except:
            continue

        if v > 0:
            values.append(v)

    if len(values) == 0:
        print(f"Skipping {layer.name()} — no positive values")
        continue

    values = np.array(values)

    # Percentile breaks based on positive values only
    breaks = np.percentile(values, percentile_breaks)
    breaks = sorted(set([round(float(b), 6) for b in breaks]))

    # If percentile breaks collapse because counts are very discrete, use unique values
    if len(breaks) < 4:
        unique_vals = sorted(set([float(v) for v in values]))
        breaks = unique_vals

    if len(breaks) < 2:
        print(f"Skipping {layer.name()} — not enough value variation")
        continue

    start_colour, end_colour = colour_sets[i % len(colour_sets)]

    # Create rule-based renderer
    root_rule = QgsRuleBasedRenderer.Rule(None)

    # NULL / zero rule: transparent fill but visible grid outline
    null_symbol = make_null_symbol(layer)
    null_rule = QgsRuleBasedRenderer.Rule(null_symbol)
    null_rule.setLabel("No value / zero")
    null_rule.setFilterExpression(f"{value_field_q} IS NULL OR {value_field_q} <= 0")
    root_rule.appendChild(null_rule)

    # Positive value rules
    n_ranges = len(breaks) - 1

    for j in range(n_ranges):

        lower = breaks[j]
        upper = breaks[j + 1]

        if upper <= lower:
            continue

        # Non-linear colour progression:
        # keeps lower classes very pale, darkens sharply at high values.
        t = j / max(1, n_ranges - 1)
        t = t ** colour_gamma

        fill_colour = interpolate_colour(
            start_colour,
            end_colour,
            t,
            fill_opacity
        )

        symbol = make_symbol(
            layer,
            fill_colour,
            fill_opacity,
            outline=True
        )

        rule = QgsRuleBasedRenderer.Rule(symbol)

        if j == 0:
            expr = f"{value_field_q} > 0 AND {value_field_q} <= {upper}"
            label = f">0 – {upper:g}"
        else:
            expr = f"{value_field_q} > {lower} AND {value_field_q} <= {upper}"
            label = f"{lower:g} – {upper:g}"

        rule.setFilterExpression(expr)
        rule.setLabel(label)

        root_rule.appendChild(rule)

    renderer = QgsRuleBasedRenderer(root_rule)

    layer.setRenderer(renderer)
    layer.setOpacity(1.0)
    layer.triggerRepaint()

    print("Styled successfully")

print("\nDone. All ISIC layers styled with transparent NULLs, visible hex grid and non-linear hotspot gradients.")