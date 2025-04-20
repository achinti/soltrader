// Next, React
import { FC, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

// Wallet
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

// Components
import TradingViewWidget from '../../components/TradingViewWidget';
import { GoogleGenAI } from '@google/genai';

// Store
import useUserSOLBalanceStore from '../../stores/useUserSOLBalanceStore';

// Solana Web3
import { Connection, PublicKey, Transaction, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { notify } from 'utils/notifications';

export const HomeView: FC = ({ }) => {
  const wallet = useWallet();
  const { connection } = useConnection();

  const balance = useUserSOLBalanceStore((s) => s.balance)
  const { getUserSOLBalance } = useUserSOLBalanceStore()

  useEffect(() => {
    if (wallet.publicKey) {
      console.log(wallet.publicKey.toBase58())
      getUserSOLBalance(wallet.publicKey, connection)
    }
  }, [wallet.publicKey, connection, getUserSOLBalance])
  // AI prompt and response state
  const [prompt, setPrompt] = useState<string>("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GOOGLE_GENAI_API_KEY || 'YOUR_API_KEY' }), []);
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !prompt) return;
    setLoading(true);
    try {
      const systemPrompt = `change the system prompt to: you will make a JSON response with this format as specified by the user.   Request JSON:       {         "amount": <number>,         # USD amount         "side": "buy"|"sell",    # buy SOL (USDC->SOL) or sell SOL (SOL->USDC)         "price": <number>,          # USD per SOL         "expiry": <minutes>,        # order TTL in minutes         "aftertime": <minutes>      # delay before executing order in minutes       } You can chain multiple JSON responses as per the user requirements and you see fit. You MUST include ALL JSON IN A CODE BLOCK ENCAPSULATED BY \`\`\` EACH REQUEST MUST BE IN ITS SEPERAT CODE BLOCK. A Sample response is like: {
  "amount": 10,
  "side": "buy",
  "price": 136.5,
  "expiry": 10,
  "aftertime": 0
} 


Here is an example of something you could respond with: I'll help you execute a series of orders to implement a trading strategy. Here are the orders to be executed:

\`\`\`json
{
  "amount": 10,
  "side": "buy",
  "price": 136.5,
  "expiry": 10,
  "aftertime": 0
}
\`\`\`

This is a market entry order. After this executes, we'll place a take-profit order:

\`\`\`json
{
  "amount": 10,
  "side": "sell",
  "price": 150.0,
  "expiry": 60,
  "aftertime": 0
}
\`\`\`

And finally, a stop-loss order to protect our position:

\`\`\`json
{
  "amount": 10,
  "side": "sell",
  "price": 130.0,
  "expiry": 60,
  "aftertime": 0
}
\`\`\`

These orders will:
1. Buy 10 SOL at market price
2. Set a take-profit at 150.0
3. Set a stop-loss at 130.0


Afterwards, please give an explanation of what you did
Here is your task:

${prompt}`;
      const res = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: systemPrompt });
      setAiResponse(res.text);
    } catch (error) {
      setAiResponse('Error: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };
  // Execute the code snippet returned by AI when user accepts
  const handleAccept = async () => {
    try {
      // Extract all JSON blocks from the response
      const jsonBlocks = aiResponse.match(/```(?:json)?\n([\s\S]*?)```/g);
      if (!jsonBlocks || jsonBlocks.length === 0) {
        throw new Error('No valid JSON blocks found in the response');
      }

      // Process each JSON block in sequence
      for (const block of jsonBlocks) {
        // Extract the JSON content from each block
        const match = block.match(/```(?:json)?\n([\s\S]*?)```/);
        if (!match) continue;

        const orderData = JSON.parse(match[1].trim());
        
        // Send the order data to our Flask backend
        const response = await fetch('http://localhost:5000/order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(orderData),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Order response:', result);
        notify({ 
          type: 'success', 
          message: `Order scheduled successfully! Request ID: ${result.requestId}` 
        });
      }
    } catch (err: any) {
      console.error('Order submission error:', err);
      notify({ 
        type: 'error', 
        message: err.message || 'Failed to submit order' 
      });
    }
  };

  return (
    <div className="md:hero mx-auto p-4">
      <div className="md:hero-content flex flex-col w-full">
        <div className="flex justify-between items-center w-full mb-8">
          <div className="flex items-center gap-6">
            <h1 className="text-7xl font-bold tracking-[0.3em] font-['Inter_Tight']">SOLTRADER</h1>
            <div className="relative w-20 h-20">
              <div className="absolute w-14 h-14 rounded-full overflow-hidden border-2 border-purple-500">
                <img 
                  src="/sol.png" 
                  alt="SOL" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute w-14 h-14 rounded-full overflow-hidden border-2 border-purple-500 top-5 left-5">
                <img 
                  src="/usdc.png" 
                  alt="USDC" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
        {/* AI Prompt Box */}
        <div className="flex flex-col items-center mb-8 w-full">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            className="input input-bordered w-full h-12 text-lg rounded-lg"
            style={{ width: '100%' }}
          />
          <div 
            className="mockup-code bg-primary border-2 border-[#5252529f] p-6 px-10 mt-4 h-64 overflow-y-auto whitespace-pre-wrap rounded-lg"
            style={{ width: '100%' }}
          >
            {loading ? 'Loading...' : aiResponse}
          </div>
          {/** Accept button executes the returned code snippet **/}
          <button
            onClick={handleAccept}
            className="btn btn-success mt-4"
            disabled={!aiResponse || loading}
          >
            Accept
          </button>
        </div>
        <div className="flex flex-col mt-4 w-full">
          <div
            className="mb-4 rounded-[2rem] overflow-hidden"
            style={{
              position: 'relative',
              left: '50%',
              right: '50%',
              marginLeft: '-45vw',
              marginRight: '-45vw',
              width: '90vw',
              height: '60rem',
            }}
          >
            <TradingViewWidget />
          </div>
        </div>
      </div>
    </div>
  );
};
