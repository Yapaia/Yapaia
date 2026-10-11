"""Constants for the GL.iNet Cellular integration."""

DOMAIN = "glinet_cellular"

DEFAULT_HOST = "192.168.8.1"
DEFAULT_USERNAME = "root"
DEFAULT_SCAN_INTERVAL = 30

CONF_SIM_SWITCH_METHOD = "sim_switch_method"
CONF_SIM_SWITCH_PARAMS = "sim_switch_params"
DEFAULT_SIM_SWITCH_METHOD = "modem.set_slot_config"

# How long the select shows the requested SIM before trusting the router again.
SIM_SWITCH_GRACE_SECONDS = 120

SERVICE_RPC_CALL = "rpc_call"
