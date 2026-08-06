"""Postfix policy server for SMTP AUTH verification against CMP database."""
import asyncio
import hashlib
import json
import sys
import os
import asyncpg
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')
logger = logging.getLogger('cmp-sasl')

DB_URL = os.environ.get('DATABASE_URL', 'postgresql+asyncpg://cmp:XIS7KIzrPKupXXcD51wvln4F@127.0.0.1:5432/cmp')

# Direct asyncpg connection (no SQLAlchemy)
DB_DSN = DB_URL.replace('postgresql+asyncpg://', 'postgresql://')

API_KEYS_FILE = "/etc/cmp/api_keys.json"
RELAY_CREDS_FILE = "/etc/cmp/sasl_relay_auth.json"


async def verify_credentials(username: str, password: str, client_ip: str = "") -> bool:
    """Verify SMTP AUTH credentials against CMP database."""
    
    # 1. Check API keys (format: cmp_relay_xxxxx)
    if password.startswith('cmp_relay_'):
        return await verify_api_key(username, password, client_ip)
    
    # 2. Check SMTP auth credentials
    return await verify_smtp_credential(username, password, client_ip)


async def verify_api_key(username: str, api_key: str, client_ip: str) -> bool:
    """Verify against API keys stored in JSON file."""
    try:
        if not os.path.exists(API_KEYS_FILE):
            return False
        
        with open(API_KEYS_FILE) as f:
            keys = json.load(f)
        
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        for key_entry in keys:
            if key_entry.get("key_hash") == key_hash and key_entry.get("enabled", True):
                # Check IP allowlist
                allowed_ips = key_entry.get("allowed_ips", [])
                if allowed_ips and client_ip not in allowed_ips:
                    logger.info(f"AUTH FAIL: API key '{key_entry.get('label')}' - IP {client_ip} not allowed")
                    return False
                
                # Update usage
                from datetime import datetime
                key_entry["last_used"] = datetime.utcnow().isoformat()
                key_entry["usage_count"] = key_entry.get("usage_count", 0) + 1
                with open(API_KEYS_FILE, 'w') as f:
                    json.dump(keys, f, indent=2)
                
                logger.info(f"AUTH OK: API key '{key_entry.get('label')}' from {client_ip}")
                return True
        
        logger.info(f"AUTH FAIL: Invalid API key from {client_ip}")
        return False
        
    except Exception as e:
        logger.error(f"API key verification error: {e}")
        return False


async def verify_smtp_credential(username: str, password: str, client_ip: str) -> bool:
    """Verify against SMTP auth credentials stored in JSON file."""
    try:
        if not os.path.exists(RELAY_CREDS_FILE):
            # Fallback to Dovecot relay-passdb file
            return await verify_dovecot_file(username, password)
        
        with open(RELAY_CREDS_FILE) as f:
            db = json.load(f)
        
        for cred in db.get("credentials", []):
            if cred["username"] == username and cred.get("enabled", True):
                # Check password hash
                stored_hash = cred.get("password_hash", "")
                input_hash = hashlib.sha256(password.encode()).hexdigest()
                
                if stored_hash == input_hash or cred.get("password") == password:
                    # Check IP allowlist
                    allowed_ips = cred.get("allowed_ips", [])
                    if allowed_ips and client_ip not in allowed_ips:
                        logger.info(f"AUTH FAIL: User '{username}' - IP {client_ip} not allowed")
                        return False
                    
                    # Update usage
                    from datetime import datetime
                    cred["last_used"] = datetime.utcnow().isoformat()
                    cred["usage_count"] = cred.get("usage_count", 0) + 1
                    with open(RELAY_CREDS_FILE, 'w') as f:
                        json.dump(db, f, indent=2)
                    
                    logger.info(f"AUTH OK: User '{username}' from {client_ip}")
                    return True
        
        logger.info(f"AUTH FAIL: Invalid credentials for '{username}' from {client_ip}")
        return False
        
    except Exception as e:
        logger.error(f"SMTP credential verification error: {e}")
        return False


async def verify_dovecot_file(username: str, password: str) -> bool:
    """Fallback: verify against Dovecot relay-passdb file."""
    try:
        passdb_path = "/etc/dovecot/relay-passdb"
        if not os.path.exists(passdb_path):
            return False
        
        with open(passdb_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                # Format: username:{PLAIN}password
                if ':' in line:
                    user, pw = line.split(':', 1)
                    if user == username:
                        # Extract password from {SCHEME} format
                        if pw.startswith('{'):
                            scheme_end = pw.index('}')
                            stored_pw = pw[scheme_end + 1:]
                        else:
                            stored_pw = pw
                        return stored_pw == password
        
        return False
    except Exception as e:
        logger.error(f"Dovecot file verification error: {e}")
        return False


async def handle_policy_request(reader, writer):
    """Handle Postfix policy request."""
    try:
        data = await asyncio.wait_for(reader.read(4096), timeout=10)
        request = data.decode().strip()
        
        # Parse policy request
        params = {}
        for line in request.split('\n'):
            if '=' in line:
                key, _, value = line.partition('=')
                params[key.strip()] = value.strip()
        
        # Extract auth info
        action = params.get('request', '')
        client_ip = params.get('client_address', '')
        sasl_username = params.get('sasl_username', '')
        sasl_method = params.get('sasl_method', '')
        
        # For SASL auth, we need the password from the SMTP session
        # Postfix policy doesn't send the password directly
        # We need to use a different approach
        
        # For now, accept all authenticated sessions (SASL already verified by Dovecot)
        # The actual verification happens in the custom Dovecot passdb
        
        response = "action=dunno\n\n"
        writer.write(response.encode())
        await writer.drain()
        
    except Exception as e:
        logger.error(f"Policy request error: {e}")
        response = "action=dunno\n\n"
        writer.write(response.encode())
        await writer.drain()
    finally:
        writer.close()


async def main():
    """Start the policy server."""
    server = await asyncio.start_server(handle_policy_request, '127.0.0.1', 10040)
    logger.info("CMP SASL Policy Server started on 127.0.0.1:10040")
    
    async with server:
        await server.serve_forever()


if __name__ == '__main__':
    asyncio.run(main())
