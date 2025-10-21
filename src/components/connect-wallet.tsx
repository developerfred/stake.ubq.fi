// src/components/connect-wallet.tsx
import { useAppKit, useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { isWalletConnectConfigured, supportedChains } from "../wallet/config";
import { ICONS } from "./iconography";
import { useStatusMessage } from "../context/status-message";
import { useEffect, useState } from "react";

export function ConnectWalletButton() {
  const { open } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount();
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { clearMessages, setErrorMessage } = useStatusMessage();
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  // Clear messages on connection status change
  useEffect(() => {
    if (isConnected) {
      clearMessages();
    }
  }, [isConnected, clearMessages]);

  // Validate network
  const isUnsupportedChain = isConnected && chainId && !supportedChains.some((c) => c.id === chainId);

  // Handle network switching
  useEffect(() => {
    if (isUnsupportedChain && !isSwitchingNetwork) {
      const timer = setTimeout(() => {
        setErrorMessage(
          `Unsupported network detected. Please switch to: ${supportedChains.map((c) => c.name).join(", ")}`
        );
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isUnsupportedChain, isSwitchingNetwork, setErrorMessage]);

  if (!isWalletConnectConfigured) {
    return (
      <button className="button-with-icon" disabled title="WalletConnect not configured. Add VITE_WALLETCONNECT_PROJECT_ID to .env">
        {ICONS.WARNING}
        <span>WalletConnect not configured</span>
      </button>
    );
  }

  const handleNetworkSwitch = async () => {
    if (!switchNetwork || !isUnsupportedChain) return;
    
    setIsSwitchingNetwork(true);
    try {
      await switchNetwork(supportedChains[0]);
      clearMessages();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to switch network");
    } finally {
      setIsSwitchingNetwork(false);
    }
  };

  if (isConnected && address) {
    const currentChain = supportedChains.find((c) => c.id === chainId);
    const chainName = currentChain?.name || `Chain ${chainId}`;
    const truncatedAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

    return (
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {isUnsupportedChain && (
          <button 
            className="button-with-icon" 
            onClick={handleNetworkSwitch}
            disabled={isSwitchingNetwork}
            style={{ backgroundColor: "#ff444420" }}
          >
            {ICONS.WARNING}
            <span>{isSwitchingNetwork ? "Switching..." : "Switch Network"}</span>
          </button>
        )}
        <button 
          id="disconnect" 
          onClick={() => open()} 
          className="button-with-icon"
          title="Click to manage wallet"
        >
          {ICONS.DISCONNECT}
          <span>
            {truncatedAddress} ({chainName})
          </span>
        </button>
      </div>
    );
  }

  return (
    <button 
      className="button-with-icon" 
      disabled={status === "connecting"} 
      onClick={() => open()}
      title={status === "connecting" ? "Connecting to wallet..." : "Connect your wallet"}
    >
      {ICONS.CONNECT}
      <span>{status === "connecting" ? "Connecting..." : "Connect Wallet"}</span>
    </button>
  );
}