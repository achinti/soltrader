#!/usr/bin/env python3
import os
import base64
import requests
import json
from solders.keypair import Keypair
from solders.transaction import VersionedTransaction
import base58
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

# API Configuration
EXECUTE_URL = "https://lite-api.jup.ag/trigger/v1/execute"
REQUEST_ID = "65c7fca1-cf86-4e78-912c-dd39900e885b"

# Get the transaction from the order response
# This would typically come from the /order endpoint response
# For testing, you'll need to provide the base64 transaction
TRANSACTION_BASE64 = "65c7fca1-cf86-4e78-912c-dd39900e885b"  # Replace with actual transaction

def sign_and_execute_transaction():
    try:
        # Get private key from environment
        PRIVATE_KEY = os.getenv('PRIVATE_KEY')
        if not PRIVATE_KEY:
            raise Exception("PRIVATE_KEY not found in environment variables")

        # Create keypair from private key
        keypair = Keypair.from_base58_string(PRIVATE_KEY)
        
        # Deserialize the transaction
        tx_bytes = base64.b64decode(TRANSACTION_BASE64)
        transaction = VersionedTransaction.from_bytes(tx_bytes)
        
        # Sign the transaction
        transaction.sign([keypair])
        
        # Serialize and encode the signed transaction
        signed_tx_bytes = bytes(transaction)
        signed_tx_b64 = base64.b64encode(signed_tx_bytes).decode('utf-8')

        # Prepare the request
        payload = json.dumps({
            "requestId": REQUEST_ID,
            "signedTransaction": signed_tx_b64
        })
        
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }

        # Execute the transaction
        response = requests.post(EXECUTE_URL, headers=headers, data=payload)
        response.raise_for_status()
        
        print("Transaction executed successfully!")
        print("Response:", response.json())
        
    except Exception as e:
        print("Error executing transaction:", str(e))

if __name__ == "__main__":
    sign_and_execute_transaction()