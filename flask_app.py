#!/usr/bin/env python3
"""
Flask backend to schedule and execute Jupiter trigger orders on Solana.
Endpoints:
  POST /order
    Request JSON:
      {
        "amount": <number>,         # USD amount
        "side": "buy"|"sell",    # buy SOL (USDC->SOL) or sell SOL (SOL->USDC)
        "price": <number>,          # USD per SOL
        "expiry": <minutes>,        # order TTL in minutes
        "aftertime": <minutes>      # delay before executing order in minutes
      }
    Response JSON:
      {
        "status": "scheduled",
        "requestId": <string>,
        "execute_in_seconds": <number>
      }
Environment variables:
  PUBLIC_KEY: Solana public key (maker/payer)
  PRIVATE_KEY: base58-encoded Solana private key
"""
import os
import time
import threading
import base64
from decimal import Decimal
from typing import Union, Optional

import requests
from flask import Flask, request, jsonify
from solana.rpc.api import Client
from solders.keypair import Keypair
from solders.transaction import VersionedTransaction
from solders.null_signer import NullSigner
from solders.signature import Signature
from solders.pubkey import Pubkey
import base58
from dotenv import load_dotenv

# Load environment variables from .env.local
load_dotenv('.env.local')

# Jupiter Trigger API endpoints
CREATE_ORDER_URL = 'https://api.jup.ag/trigger/v1/createOrder'
EXECUTE_ORDER_URL = 'https://api.jup.ag/trigger/v1/execute'

# Token mints
USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
SOL_MINT = 'So11111111111111111111111111111111111111112'

# Maker/Payer keys (must be set)
PUBLIC_KEY = os.getenv('PUBLIC_KEY')
PRIVATE_KEY = os.getenv('PRIVATE_KEY')
if not PUBLIC_KEY or not PRIVATE_KEY:
    raise Exception('Set PUBLIC_KEY and PRIVATE_KEY environment variables')

def set_transaction_signature(transaction_signature_string: str):
    transaction_signature = Signature.from_string(transaction_signature_string)
    return transaction_signature

def execute_job(tx_b64: str, request_id: str):
    """Signs and executes the transaction after scheduled delay"""
    try:
        # Create keypair from private key
        keypair = Keypair.from_base58_string(PRIVATE_KEY)
        
        # Deserialize the transaction
        tx_bytes = base64.b64decode(tx_b64)
        transaction = VersionedTransaction.from_bytes(tx_bytes)
        
        # Build the list of signers
        # only the first `num_required_signers` slots in account_keys need signatures
        header = transaction.message.header
        num_signers = header.num_required_signatures
        acct_keys = transaction.message.account_keys[:num_signers]

        signers = []
        for acct in acct_keys:
            if acct == keypair.pubkey():
                # our real signature
                signers.append(keypair)
            else:
                # dummy placeholder for other required signer slots
                signers.append(NullSigner(acct))

        # Construct a new VersionedTransaction which will sign under the hood
        signed_transaction = VersionedTransaction(transaction.message, signers)

        # Get the signature
        signature = signed_transaction.signatures[0]
        
        # Serialize and encode the signed transaction
        signed_tx_bytes = bytes(signed_transaction)
        signed_tx_b64 = base64.b64encode(signed_tx_bytes).decode('utf-8')

        # Execute order
        resp = requests.post(
            EXECUTE_ORDER_URL,
            json={
                'requestId': request_id,
                'signedTransaction': signed_tx_b64,
            },
        )
        resp.raise_for_status()
        print(f"[{time.ctime()}] Executed {request_id}: {resp.json()}")
        
        # Verify transaction
        solana_client = Client("https://api.mainnet-beta.solana.com")
        transaction_signature = set_transaction_signature(str(signature))
        transaction_status = solana_client.confirm_transaction(
            tx_sig=transaction_signature,
            commitment=None,
            sleep_seconds=0.5
        ).value[0].confirmation_status
        print(f"[{time.ctime()}] Transaction status: {transaction_status}")
        
    except Exception as e:
        print(f"[{time.ctime()}] Execution error {request_id}: {e}")

app = Flask(__name__)

@app.route('/order', methods=['POST'])
def create_and_schedule_order():
    data = request.get_json(force=True)
    # Validate input
    try:
        amount = Decimal(str(data['amount']))
        side = data['side'].lower()
        price = Decimal(str(data['price']))
        expiry = int(data.get('expiry', 1))
        after = int(data.get('aftertime', 0))
    except Exception as e:
        return jsonify({'error': 'Invalid params', 'details': str(e)}), 400

    if side not in ('buy', 'sell'):
        return jsonify({'error': "'side' must be 'buy' or 'sell'"}), 400

    # Determine input/output mints and amounts (in smallest units)
    if side == 'buy':
        input_mint = USDC_MINT
        output_mint = SOL_MINT
        making = int(amount * Decimal(10**6))
        taking = int((amount / price) * Decimal(10**9))
    else:
        input_mint = SOL_MINT
        output_mint = USDC_MINT
        making = int(amount * Decimal(10**9))
        taking = int((amount * price) * Decimal(10**6))

    expired_at = int(time.time()) + expiry * 60

    payload = {
        'inputMint': input_mint,
        'outputMint': output_mint,
        'maker': PUBLIC_KEY,
        'payer': PUBLIC_KEY,
        'params': {
            'makingAmount': str(making),
            'takingAmount': str(taking),
        },
        'computeUnitPrice': 'auto',
        'expiredAt': str(expired_at),
    }
    # Create order
    try:
        r = requests.post(CREATE_ORDER_URL, json=payload)
        r.raise_for_status()
        order_resp = r.json()
    except Exception as e:
        return jsonify({'error': 'createOrder failed', 'details': str(e)}), 500

    tx = order_resp.get('tx') or order_resp.get('transaction')
    req_id = order_resp.get('requestId') or order_resp.get('id')
    if not tx or not req_id:
        return jsonify({'error': 'Invalid createOrder response', 'resp': order_resp}), 500

    # Schedule execution
    delay = after * 60
    t = threading.Timer(delay, execute_job, args=(tx, req_id))
    t.daemon = True
    t.start()

    return jsonify({'status': 'scheduled', 'requestId': req_id, 'execute_in_seconds': delay}), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)