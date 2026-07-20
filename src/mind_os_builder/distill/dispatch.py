from __future__ import annotations

from mind_os_builder.distill.models import DistillPlan, DistillTrigger, Persona


def dispatch_waves(plan: DistillPlan) -> tuple[tuple[DistillTrigger, ...], ...]:
    """Return parallel waves while serializing triggers that share Ember state."""
    regular = [trigger for trigger in plan.triggers if trigger.persona is not Persona.EMBER]
    ember = [trigger for trigger in plan.triggers if trigger.persona is Persona.EMBER]
    waves: list[tuple[DistillTrigger, ...]] = []
    first = tuple(regular + ember[:1])
    if first:
        waves.append(first)
    waves.extend((trigger,) for trigger in ember[1:])
    return tuple(waves)
