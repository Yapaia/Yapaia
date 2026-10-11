"""Cellular status sensors."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import (
    SIGNAL_STRENGTH_DECIBELS,
    SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
    EntityCategory,
    UnitOfInformation,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import CellularState
from .coordinator import GLiNetConfigEntry
from .entity import GLiNetEntity


@dataclass(frozen=True, kw_only=True)
class GLiNetSensorDescription(SensorEntityDescription):
    value_fn: Callable[[CellularState], str | int | float | None]


def _dbm(key: str, attr: str, enabled: bool = True) -> GLiNetSensorDescription:
    return GLiNetSensorDescription(
        key=key,
        device_class=SensorDeviceClass.SIGNAL_STRENGTH,
        native_unit_of_measurement=SIGNAL_STRENGTH_DECIBELS_MILLIWATT,
        state_class=SensorStateClass.MEASUREMENT,
        entity_registry_enabled_default=enabled,
        value_fn=lambda s: getattr(s, attr),
    )


SENSORS: tuple[GLiNetSensorDescription, ...] = (
    GLiNetSensorDescription(
        key="active_sim",
        value_fn=lambda s: s.active_sim,
    ),
    GLiNetSensorDescription(
        key="carrier",
        value_fn=lambda s: s.carrier,
    ),
    GLiNetSensorDescription(
        key="network_type",
        value_fn=lambda s: s.network_type,
    ),
    GLiNetSensorDescription(
        key="bands",
        value_fn=lambda s: s.bands,
    ),
    GLiNetSensorDescription(
        key="signal_bars",
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s: s.signal_bars,
    ),
    _dbm("rsrp", "rsrp"),
    _dbm("rssi", "rssi", enabled=False),
    GLiNetSensorDescription(
        key="rsrq",
        device_class=SensorDeviceClass.SIGNAL_STRENGTH,
        native_unit_of_measurement=SIGNAL_STRENGTH_DECIBELS,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s: s.rsrq,
    ),
    GLiNetSensorDescription(
        key="sinr",
        device_class=SensorDeviceClass.SIGNAL_STRENGTH,
        native_unit_of_measurement=SIGNAL_STRENGTH_DECIBELS,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s: s.sinr,
    ),
    GLiNetSensorDescription(
        key="traffic_total",
        device_class=SensorDeviceClass.DATA_SIZE,
        native_unit_of_measurement=UnitOfInformation.BYTES,
        suggested_unit_of_measurement=UnitOfInformation.GIGABYTES,
        suggested_display_precision=2,
        state_class=SensorStateClass.TOTAL_INCREASING,
        value_fn=lambda s: s.traffic_total,
    ),
    GLiNetSensorDescription(
        key="modem_model",
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda s: s.modem_model,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GLiNetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    coordinator = entry.runtime_data
    async_add_entities(GLiNetSensor(coordinator, desc) for desc in SENSORS)


class GLiNetSensor(GLiNetEntity, SensorEntity):
    entity_description: GLiNetSensorDescription

    def __init__(self, coordinator, description: GLiNetSensorDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> str | int | float | None:
        return self.entity_description.value_fn(self.coordinator.data)
