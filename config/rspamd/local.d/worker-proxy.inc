# Rspamd Proxy Worker Configuration
# local.d/worker-proxy.inc

# Milter mode - listens for mail from Postfix
bind_socket = "127.0.0.1:11332";

# Upstream (normal Rspamd workers)
upstream "local" {
    default = yes;
    hosts = "127.0.0.1:11333";
}

# Milter mode
milter = yes;

# Timeout settings
timeout = 60s;

# Re-injection settings for outbound mail
# After scanning, mail goes back to Postfix on port 10025
count = 2;

# DKIM signing is done in the proxy
# see local.d/dkim_signing.conf

# Spam header
spam_header = "X-Spam";

# Reject messages scoring above this threshold
reject_message = "Message rejected due to high spam score";

# Self-scan mode (use local scanner)
self_scan = true;

# Check for forged received headers
check_all_filters = true;
