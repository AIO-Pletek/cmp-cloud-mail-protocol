# Rspamd Logging Configuration
# local.d/logging.inc

type = "file";
filename = "/var/log/rspamd/rspamd.log";
level = "info";
log_urls = false;

# Log format
log_format = "%t %P <%p> %s: %m";

# Separate log for spam detections
spam_log {
    enabled = true;
    filename = "/var/log/rspamd/spam.log";
    selectors = ["is_spam"];
}

# Error log
error_log {
    enabled = true;
    filename = "/var/log/rspamd/error.log";
    level = "error";
}

# Log rotation
log_rotate = true;

# Debug modules (empty by default)
debug_modules = [];

# Color output for console
color = false;

# Log buffer
buffer = 4096;

# Systemd journal logging (alternative)
# type = "console";
# systemd = true;
