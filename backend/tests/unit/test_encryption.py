from ledger_sync.core.encryption import decrypt_api_key, encrypt_api_key


def test_round_trip():
    key = "sk-ant-api03-reallyLongKeyHere12345"
    encrypted = encrypt_api_key(key)
    assert encrypted != key
    assert decrypt_api_key(encrypted) == key


def test_different_nonces():
    key = "sk-test-key-123"
    e1 = encrypt_api_key(key)
    e2 = encrypt_api_key(key)
    assert e1 != e2


def test_empty_key():
    encrypted = encrypt_api_key("")
    assert decrypt_api_key(encrypted) == ""
