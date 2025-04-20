declare interface Window {
  Jupiter: {
    init: (config: {
      displayMode: string;
      integratedTargetId: string;
      endpoint: string;
      formProps: {
        fixedInputMint: boolean;
        fixedOutputMint: boolean;
        swapMode: string;
        fixedAmount: boolean;
        initialAmount: string;
        initialSlippageBps: number;
      };
    }) => void;
  };
} 