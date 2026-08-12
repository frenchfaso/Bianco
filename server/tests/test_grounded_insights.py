import json

import pytest
from pydantic import ValidationError

from app.schemas.ai import (
    GroundedInsightSelection,
    InsightSnapshot,
)
from app.providers.common import insight_prompt_data
from app.services.grounded_insights import render_grounded_insights


def snapshot(locale="it-IT") -> InsightSnapshot:
    return InsightSnapshot.model_validate({
        "locale": locale,
        "currency": "EUR",
        "period": {
            "start": "2026-08-01",
            "end": "2026-08-31",
            "previousStart": "2026-07-01",
            "previousEnd": "2026-07-31",
        },
        "total": 18450,
        "previousTotal": 14500,
        "categories": [{
            "id": "food_grocery",
            "total": 12100,
            "count": 6,
            "previousTotal": 10000,
            "difference": 2100,
            "changePercent": 21.0,
        }],
        "merchants": [{
            "id": "Mercato Aurora",
            "total": 12100,
            "count": 6,
            "previousTotal": 10000,
            "difference": 2100,
            "changePercent": 21.0,
        }],
        "items": [{
            "id": "Pasta del Borgo",
            "total": 1800,
            "quantity": 6,
            "frequency": 3,
        }],
        "priceChanges": [{
            "id": "Detergente Limone",
            "latest": 1200,
            "previousAverage": 1000,
            "difference": 200,
            "changePercent": 20.0,
        }],
    })


def selection(payload) -> GroundedInsightSelection:
    return GroundedInsightSelection.model_validate(payload)


def test_renderer_grounds_and_localizes_every_value_from_snapshot():
    generated = render_grounded_insights(
        snapshot(),
        selection({
            "observations": [
                {"ref": "total", "emphasis": "change"},
                {"ref": "category:0", "emphasis": "current"},
                {"ref": "item:0", "emphasis": "frequency"},
            ],
            "suggestionObservation": 0,
        }),
    )

    assert generated.observations == [
        "Spesa totale: aumento di 39,50 EUR (27,2%) rispetto al periodo precedente.",
        "Spesa alimentare: 121,00 EUR nel periodo corrente.",
        "Pasta del Borgo compare in 3 acquisti nel periodo corrente.",
    ]
    assert generated.suggestion == (
        "Spesa totale: guarda il dettaglio per categoria per individuare dove si "
        "concentra l'aumento."
    )


def test_prompt_advertises_only_emphasis_supported_by_renderer():
    payload = json.loads(insight_prompt_data(snapshot()))
    assert payload["totalAllowedEmphasis"] == ["current", "change"]
    assert payload["totalSuggestionAllowed"] is True
    assert payload["categories"][0]["allowedEmphasis"] == ["current", "change"]
    assert payload["categories"][0]["suggestionAllowed"] is True
    assert payload["merchants"][0]["allowedEmphasis"] == ["current", "change"]
    assert payload["merchants"][0]["suggestionAllowed"] is True
    assert payload["items"][0]["allowedEmphasis"] == ["current", "frequency"]
    assert payload["items"][0]["suggestionAllowed"] is True
    assert payload["priceChanges"][0]["allowedEmphasis"] == ["current", "change"]
    assert payload["priceChanges"][0]["suggestionAllowed"] is True


@pytest.mark.parametrize(
    "payload",
    [
        {
            "observations": [
                {"ref": "merchant:99", "emphasis": "current"},
            ],
            "suggestionObservation": None,
        },
        {
            "observations": [
                {"ref": "item:0", "emphasis": "change"},
            ],
            "suggestionObservation": None,
        },
    ],
)
def test_renderer_rejects_unavailable_or_unsupported_claims(payload):
    with pytest.raises(ValueError):
        render_grounded_insights(snapshot(), selection(payload))


def test_renderer_derives_change_instead_of_trusting_client_delta_fields():
    data = snapshot()
    data.categories[0].difference = -999
    data.categories[0].change_percent = -99

    generated = render_grounded_insights(
        data,
        selection({
            "observations": [{"ref": "category:0", "emphasis": "change"}],
            "suggestionObservation": 0,
        }),
    )

    assert generated.observations == [
        "Spesa alimentare: aumento di 21,00 EUR (21%) rispetto al periodo precedente."
    ]
    assert "99" not in generated.observations[0]

    prompt_payload = json.loads(insight_prompt_data(data))
    assert prompt_payload["categories"][0]["difference"] == "21.00"
    assert prompt_payload["categories"][0]["changePercent"] == 21.0


@pytest.mark.parametrize(
    "observation",
    [
        {"ref": "category:0", "emphasis": "current"},
        {"ref": "item:0", "emphasis": "frequency"},
    ],
)
def test_unsupported_suggestion_is_dropped_without_losing_observation(observation):
    data = snapshot()
    data.items[0].frequency = 1
    generated = render_grounded_insights(
        data,
        selection({
            "observations": [observation],
            "suggestionObservation": 0,
        }),
    )
    assert len(generated.observations) == 1
    assert generated.suggestion is None


def test_selection_rejects_duplicate_refs_and_invalid_suggestion_index():
    with pytest.raises(ValidationError):
        selection({
            "observations": [
                {"ref": "total", "emphasis": "current"},
                {"ref": "total", "emphasis": "change"},
            ],
            "suggestionObservation": None,
        })
    with pytest.raises(ValidationError):
        selection({
            "observations": [{"ref": "total", "emphasis": "current"}],
            "suggestionObservation": 1,
        })


@pytest.mark.parametrize(
    ("locale", "expected"),
    [
        ("en-GB", "Total spending: review the category breakdown to see where the increase is concentrated."),
        ("it-IT", "Spesa totale: guarda il dettaglio per categoria per individuare dove si concentra l'aumento."),
        ("de-DE", "Gesamtausgaben: Sieh dir die Aufschlüsselung nach Kategorien an, um den Anstieg einzuordnen."),
        ("es-ES", "Gasto total: consulta el desglose por categorías para localizar dónde se concentra el aumento."),
        ("fr-FR", "Dépenses totales : consultez le détail par catégorie pour situer la hausse."),
    ],
)
def test_total_increase_suggestion_is_actionable_in_every_locale(locale, expected):
    generated = render_grounded_insights(
        snapshot(locale),
        selection({
            "observations": [{"ref": "total", "emphasis": "change"}],
            "suggestionObservation": 0,
        }),
    )
    assert generated.suggestion == expected


@pytest.mark.parametrize(
    ("ref", "locale", "expected"),
    [
        ("category:0", "en-GB", "Groceries: review this period's purchases and items to see where the increase is concentrated."),
        ("category:0", "it-IT", "Spesa alimentare: guarda gli acquisti e le voci del periodo per individuare dove si concentra l'aumento."),
        ("category:0", "de-DE", "Lebensmittel: Sieh dir die Einkäufe und Positionen des Zeitraums an, um den Anstieg einzuordnen."),
        ("category:0", "es-ES", "Alimentación: consulta las compras y los artículos del periodo para localizar dónde se concentra el aumento."),
        ("category:0", "fr-FR", "Courses alimentaires : consultez les achats et les articles de la période pour situer la hausse."),
        ("merchant:0", "en-GB", "Mercato Aurora: review this period's purchases and items to see where the increase is concentrated."),
        ("merchant:0", "it-IT", "Mercato Aurora: guarda gli acquisti e le voci del periodo per individuare dove si concentra l'aumento."),
        ("merchant:0", "de-DE", "Mercato Aurora: Sieh dir die Einkäufe und Positionen des Zeitraums an, um den Anstieg einzuordnen."),
        ("merchant:0", "es-ES", "Mercato Aurora: consulta las compras y los artículos del periodo para localizar dónde se concentra el aumento."),
        ("merchant:0", "fr-FR", "Mercato Aurora : consultez les achats et les articles de la période pour situer la hausse."),
    ],
)
def test_category_and_merchant_increase_suggestions_are_actionable_in_every_locale(
    ref, locale, expected,
):
    generated = render_grounded_insights(
        snapshot(locale),
        selection({
            "observations": [{"ref": ref, "emphasis": "change"}],
            "suggestionObservation": 0,
        }),
    )
    assert generated.suggestion == expected


@pytest.mark.parametrize(
    ("locale", "expected"),
    [
        ("en-GB", "Detergente Limone: compare the latest price with an equivalent pack size or similar alternatives."),
        ("it-IT", "Detergente Limone: confronta l'ultimo prezzo con un formato equivalente o con prodotti alternativi."),
        ("de-DE", "Detergente Limone: Vergleiche den aktuellen Preis mit einer entsprechenden Packungsgröße oder ähnlichen Alternativen."),
        ("es-ES", "Detergente Limone: compara el precio actual con un formato equivalente o con alternativas similares."),
        ("fr-FR", "Detergente Limone : comparez le prix actuel avec un format équivalent ou des produits similaires."),
    ],
)
def test_price_increase_suggestion_is_actionable_in_every_locale(locale, expected):
    generated = render_grounded_insights(
        snapshot(locale),
        selection({
            "observations": [{"ref": "price_change:0", "emphasis": "change"}],
            "suggestionObservation": 0,
        }),
    )
    assert generated.suggestion == expected


@pytest.mark.parametrize(
    "observation",
    [
        {"ref": "price_change:0", "emphasis": "change"},
        {"ref": "item:0", "emphasis": "frequency"},
    ],
)
def test_decrease_and_frequency_suggestions_are_dropped(observation):
    data = snapshot()
    if observation["ref"] == "price_change:0":
        data.price_changes[0].latest = 800
        data.price_changes[0].previous_average = 1000
    generated = render_grounded_insights(
        data,
        selection({
            "observations": [observation],
            "suggestionObservation": 0,
        }),
    )
    assert generated.suggestion is None


@pytest.mark.parametrize("direction", ["current", "stable", "no_baseline"])
def test_non_increase_suggestions_are_dropped(direction):
    data = snapshot()
    emphasis = "change"
    if direction == "current":
        emphasis = "current"
    elif direction == "stable":
        data.previous_total = data.total
    else:
        data.previous_total = 0
    generated = render_grounded_insights(
        data,
        selection({
            "observations": [{"ref": "total", "emphasis": emphasis}],
            "suggestionObservation": 0,
        }),
    )
    assert generated.suggestion is None


def test_french_personal_category_label_is_unambiguous():
    data = snapshot("fr-FR")
    data.categories[0].id = "personal"
    generated = render_grounded_insights(
        data,
        selection({
            "observations": [{"ref": "category:0", "emphasis": "current"}],
            "suggestionObservation": None,
        }),
    )
    assert generated.observations == [
        "Dépenses personnelles : 121,00 EUR sur la période actuelle."
    ]
