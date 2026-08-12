from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Callable

from app.insight_categories import CATEGORY_LABELS
from app.schemas.ai import (
    GeneratedInsights,
    GroundedInsightReference,
    GroundedInsightSelection,
    InsightComparisonEntry,
    InsightItemEntry,
    InsightPriceChangeEntry,
    InsightSnapshot,
)


# Manual contract version: bump for every change to rendering or grounded math,
# even when the copy/schema material below happens to remain byte-identical.
GROUNDED_INSIGHT_RENDER_VERSION = "grounded-render-v3"


@dataclass(frozen=True)
class _ResolvedReference:
    kind: str
    label: str
    value: object


_COPY = {
    "en": {
        "current": "{label}: {amount} in the current period.",
        "change_up": "{label}: increase of {amount} ({percent}) from the previous period.",
        "change_down": "{label}: decrease of {amount} ({percent}) from the previous period.",
        "change_stable": "{label}: no change from the previous period.",
        "no_baseline": "{label}: {amount}; no previous-period comparison is available.",
        "frequency": "{label} appears in {count} purchases in the current period.",
        "price_current": "{label}: latest price {amount}.",
        "suggestion_total_up": "{label}: review the category breakdown to see where the increase is concentrated.",
        "suggestion_comparison_up": "{label}: review this period's purchases and items to see where the increase is concentrated.",
        "suggestion_price_up": "{label}: compare the latest price with an equivalent pack size or similar alternatives.",
    },
    "it": {
        "current": "{label}: {amount} nel periodo corrente.",
        "change_up": "{label}: aumento di {amount} ({percent}) rispetto al periodo precedente.",
        "change_down": "{label}: riduzione di {amount} ({percent}) rispetto al periodo precedente.",
        "change_stable": "{label}: nessuna variazione rispetto al periodo precedente.",
        "no_baseline": "{label}: {amount}; non è disponibile un confronto col periodo precedente.",
        "frequency": "{label} compare in {count} acquisti nel periodo corrente.",
        "price_current": "{label}: ultimo prezzo {amount}.",
        "suggestion_total_up": "{label}: guarda il dettaglio per categoria per individuare dove si concentra l'aumento.",
        "suggestion_comparison_up": "{label}: guarda gli acquisti e le voci del periodo per individuare dove si concentra l'aumento.",
        "suggestion_price_up": "{label}: confronta l'ultimo prezzo con un formato equivalente o con prodotti alternativi.",
    },
    "de": {
        "current": "{label}: {amount} im aktuellen Zeitraum.",
        "change_up": "{label}: Anstieg um {amount} ({percent}) gegenüber dem vorherigen Zeitraum.",
        "change_down": "{label}: Rückgang um {amount} ({percent}) gegenüber dem vorherigen Zeitraum.",
        "change_stable": "{label}: keine Veränderung gegenüber dem vorherigen Zeitraum.",
        "no_baseline": "{label}: {amount}; kein Vergleichszeitraum ist verfügbar.",
        "frequency": "{label} wurde im aktuellen Zeitraum bei {count} Einkäufen gekauft.",
        "price_current": "{label}: letzter Preis {amount}.",
        "suggestion_total_up": "{label}: Sieh dir die Aufschlüsselung nach Kategorien an, um den Anstieg einzuordnen.",
        "suggestion_comparison_up": "{label}: Sieh dir die Einkäufe und Positionen des Zeitraums an, um den Anstieg einzuordnen.",
        "suggestion_price_up": "{label}: Vergleiche den aktuellen Preis mit einer entsprechenden Packungsgröße oder ähnlichen Alternativen.",
    },
    "es": {
        "current": "{label}: {amount} en el periodo actual.",
        "change_up": "{label}: aumento de {amount} ({percent}) respecto al periodo anterior.",
        "change_down": "{label}: disminución de {amount} ({percent}) respecto al periodo anterior.",
        "change_stable": "{label}: sin cambios respecto al periodo anterior.",
        "no_baseline": "{label}: {amount}; no hay comparación con el periodo anterior.",
        "frequency": "{label} aparece en {count} compras del periodo actual.",
        "price_current": "{label}: último precio {amount}.",
        "suggestion_total_up": "{label}: consulta el desglose por categorías para localizar dónde se concentra el aumento.",
        "suggestion_comparison_up": "{label}: consulta las compras y los artículos del periodo para localizar dónde se concentra el aumento.",
        "suggestion_price_up": "{label}: compara el precio actual con un formato equivalente o con alternativas similares.",
    },
    "fr": {
        "current": "{label} : {amount} sur la période actuelle.",
        "change_up": "{label} : hausse de {amount} ({percent}) par rapport à la période précédente.",
        "change_down": "{label} : baisse de {amount} ({percent}) par rapport à la période précédente.",
        "change_stable": "{label} : aucun changement par rapport à la période précédente.",
        "no_baseline": "{label} : {amount} ; aucune comparaison précédente n'est disponible.",
        "frequency": "{label} apparaît dans {count} achats sur la période actuelle.",
        "price_current": "{label} : dernier prix {amount}.",
        "suggestion_total_up": "{label} : consultez le détail par catégorie pour situer la hausse.",
        "suggestion_comparison_up": "{label} : consultez les achats et les articles de la période pour situer la hausse.",
        "suggestion_price_up": "{label} : comparez le prix actuel avec un format équivalent ou des produits similaires.",
    },
}

_TOTAL_LABELS = {
    "en": "Total spending",
    "it": "Spesa totale",
    "de": "Gesamtausgaben",
    "es": "Gasto total",
    "fr": "Dépenses totales",
}


def _language(snapshot: InsightSnapshot) -> str:
    language = snapshot.locale.split("-", 1)[0].lower()
    return language if language in _COPY else "en"


def _amount(value: int, currency: str, language: str) -> str:
    sign = "-" if value < 0 else ""
    whole, minor = divmod(abs(value), 100)
    decimal = f"{sign}{whole:,}.{minor:02d}"
    if language in {"it", "de", "es", "fr"}:
        decimal = decimal.replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{decimal} {currency}"


def _percent(value: Decimal | None, language: str) -> str:
    if value is None:
        raise ValueError("change percentage is unavailable")
    rendered = format(
        abs(value).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP),
        "f",
    ).rstrip("0").rstrip(".")
    if language in {"it", "de", "es", "fr"}:
        rendered = rendered.replace(".", ",")
    return f"{rendered}%"


def _change_details(current: int, previous: int) -> tuple[str, int, Decimal | None]:
    difference = current - previous
    if previous == 0:
        return "no_baseline", difference, None
    percent = Decimal(difference) * Decimal(100) / Decimal(previous)
    if difference > 0:
        return "change_up", difference, percent
    if difference < 0:
        return "change_down", difference, percent
    return "change_stable", difference, percent


def _comparison_direction(entry: InsightComparisonEntry) -> str:
    if entry.previous_total == 0:
        return "no_baseline"
    if entry.total > entry.previous_total:
        return "change_up"
    if entry.total < entry.previous_total:
        return "change_down"
    return "change_stable"


def _resolve(snapshot: InsightSnapshot, ref: str) -> _ResolvedReference:
    language = _language(snapshot)
    if ref == "total":
        return _ResolvedReference("total", _TOTAL_LABELS[language], snapshot)
    kind, raw_index = ref.split(":", 1)
    index = int(raw_index)
    collections: dict[str, tuple[list[object], Callable[[object], str]]] = {
        "category": (
            list(snapshot.categories),
            lambda entry: CATEGORY_LABELS[language][entry.id],
        ),
        "merchant": (list(snapshot.merchants), lambda entry: entry.id),
        "item": (list(snapshot.items), lambda entry: entry.id),
        "price_change": (list(snapshot.price_changes), lambda entry: entry.id),
    }
    collection, label_for = collections[kind]
    try:
        value = collection[index]
    except IndexError as error:
        raise ValueError("insight reference does not exist") from error
    return _ResolvedReference(kind, label_for(value), value)


def _render_observation(
    snapshot: InsightSnapshot,
    selected: GroundedInsightReference,
) -> tuple[str, str]:
    language = _language(snapshot)
    copy = _COPY[language]
    resolved = _resolve(snapshot, selected.ref)
    if resolved.kind == "total":
        if selected.emphasis == "frequency":
            raise ValueError("total does not support frequency emphasis")
        if selected.emphasis == "current":
            return copy["current"].format(
                label=resolved.label,
                amount=_amount(snapshot.total, snapshot.currency, language),
            ), "current"
        direction, difference, percent = _change_details(
            snapshot.total,
            snapshot.previous_total,
        )
        return _render_change(
            copy, resolved.label, snapshot.total, difference, percent,
            snapshot.currency, language, direction,
        ), direction
    if resolved.kind in {"category", "merchant"}:
        entry = resolved.value
        if selected.emphasis == "frequency":
            raise ValueError("comparison entries do not support frequency emphasis")
        if selected.emphasis == "current":
            return copy["current"].format(
                label=resolved.label,
                amount=_amount(entry.total, snapshot.currency, language),
            ), "current"
        direction = _comparison_direction(entry)
        _direction, difference, percent = _change_details(
            entry.total,
            entry.previous_total,
        )
        return _render_change(
            copy, resolved.label, entry.total, difference,
            percent, snapshot.currency, language, direction,
        ), direction
    if resolved.kind == "item":
        entry: InsightItemEntry = resolved.value
        if selected.emphasis == "change":
            raise ValueError("items do not support change emphasis")
        if selected.emphasis == "frequency":
            return copy["frequency"].format(
                label=resolved.label,
                count=entry.frequency,
            ), "frequency"
        return copy["current"].format(
            label=resolved.label,
            amount=_amount(entry.total, snapshot.currency, language),
        ), "current"
    entry: InsightPriceChangeEntry = resolved.value
    if selected.emphasis == "frequency":
        raise ValueError("price changes do not support frequency emphasis")
    if selected.emphasis == "current":
        return copy["price_current"].format(
            label=resolved.label,
            amount=_amount(entry.latest, snapshot.currency, language),
        ), "current"
    direction, difference, percent = _change_details(
        entry.latest,
        entry.previous_average,
    )
    return _render_change(
        copy, resolved.label, entry.latest, difference,
        percent, snapshot.currency, language, direction,
    ), direction


def _render_change(
    copy: dict[str, str],
    label: str,
    current: int,
    difference: int,
    percent: Decimal | None,
    currency: str,
    language: str,
    direction: str,
) -> str:
    if direction == "no_baseline":
        return copy[direction].format(
            label=label,
            amount=_amount(current, currency, language),
        )
    if direction == "change_stable":
        return copy[direction].format(label=label)
    return copy[direction].format(
        label=label,
        amount=_amount(abs(difference), currency, language),
        percent=_percent(percent, language),
    )


def render_grounded_insights(
    snapshot: InsightSnapshot,
    selection: GroundedInsightSelection,
) -> GeneratedInsights:
    rendered = [
        _render_observation(snapshot, observation)
        for observation in selection.observations
    ]
    suggestion = None
    if selection.suggestion_observation is not None:
        index = selection.suggestion_observation
        observation = selection.observations[index]
        resolved = _resolve(snapshot, observation.ref)
        direction = rendered[index][1]
        suggestion_keys = {
            "total": "suggestion_total_up",
            "category": "suggestion_comparison_up",
            "merchant": "suggestion_comparison_up",
            "price_change": "suggestion_price_up",
        }
        key = suggestion_keys.get(resolved.kind) if direction == "change_up" else None
        if key is not None:
            suggestion = _COPY[_language(snapshot)][key].format(label=resolved.label)
    return GeneratedInsights(
        observations=[text for text, _direction in rendered],
        suggestion=suggestion,
    )


def grounded_insight_renderer_fingerprint_material() -> dict[str, object]:
    """Return internal renderer material that is HMACed before leaving server."""
    return {
        "version": GROUNDED_INSIGHT_RENDER_VERSION,
        "copy": _COPY,
        "totalLabels": _TOTAL_LABELS,
    }
