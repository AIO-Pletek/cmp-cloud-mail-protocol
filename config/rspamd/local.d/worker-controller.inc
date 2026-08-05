# Rspamd Controller Worker Configuration
# local.d/worker-controller.inc

bind_socket = "127.0.0.1:11334";
password = "cmp_rspamd_controller";
enable_password = "cmp_rspamd_controller_secure";

# Secure IP access
secure_ip = ["127.0.0.1", "::1"];

# Stats collection
stats_key = "cmp_stats_key";

# WebUI static files
static_dir = "${SHAREDIR}/www";

# History settings
history_rows = 200;

# Fuzzy storage
fuzzy_map = [
    {
        max_score = 20.0;
        flag = 1;
    }
];

# CORS for external access (optional)
# cors_allow_origin = "https://mail.cmp.local";

# Counters
counters {
    enabled = true;
}
