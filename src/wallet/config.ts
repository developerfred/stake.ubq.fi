import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { mainnet, type Chain } from "viem/chains";
import { isLocalNode, RPC_URL } from "../constants/config";
import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

// Custom Anvil chain with proper configuration
const anvilChain = {
  id: 31337,
  name: "Anvil",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
  },
  testnet: true,
} as const satisfies Chain;

// Get and validate project ID
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || "";

export const isWalletConnectConfigured = projectId.length > 0;

// Warn if not configured (but only in development)
if (!isWalletConnectConfigured && import.meta.env.DEV) {
  console.warn(
    "⚠️  VITE_WALLETCONNECT_PROJECT_ID not configured. WalletConnect features will be limited.\n" +
    "Get your project ID at: https://cloud.reown.com/"
  );
}

// Supported chains based on mode
const supportedChains: [Chain, ...Chain[]] = isLocalNode 
  ? [mainnet, anvilChain] 
  : [mainnet];

const metadata = {
  name: "Ubiquity Stake",
  description: "Staking frontend for the Ubiquity protocol",
  url: typeof window !== "undefined" ? window.location.origin : "https://stake.ubq.fi",
  icons: [
    typeof window !== "undefined" 
      ? `${window.location.origin}/src/assets/ubiquity-dao-logo.svg` 
      : "https://stake.ubq.fi/src/assets/ubiquity-dao-logo.svg"
  ],
};

// Create transports for wagmi
const transports = supportedChains.reduce((acc, chain) => {
  const rpcUrl = isLocalNode && chain.id === 31337 
    ? RPC_URL 
    : `${RPC_URL}/${chain.id}`;
  
  acc[chain.id] = http(rpcUrl, { 
    batch: true,
    timeout: 30_000,
  });
  return acc;
}, {} as Record<number, ReturnType<typeof http>>);

// Create wagmi config (single source of truth)
export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected()],
  transports,
  batch: {
    multicall: {
      wait: 50,
    },
  },
  ssr: false,
});

// Reown configuration
let appKit: ReturnType<typeof createAppKit> | null = null;
let wagmiAdapter: WagmiAdapter | null = null;

export function initializeAppKit() {
  // Don't initialize if already done
  if (appKit) {
    return { appKit, wagmiAdapter };
  }

  // Don't initialize if project ID is missing
  if (!isWalletConnectConfigured) {
    console.warn("Skipping Reown AppKit initialization: Project ID not configured");
    return { appKit: null, wagmiAdapter: null };
  }

  try {
    // Create WagmiAdapter
    wagmiAdapter = new WagmiAdapter({
      networks: supportedChains as any,
      projectId,
      ssr: false,
    });

    // Create AppKit with lazy loading
    appKit = createAppKit({
      adapters: [wagmiAdapter],
      networks: supportedChains as any,
      projectId,
      metadata,
      features: {
        analytics: false,
        email: false,
        socials: [],
        onramp: false,
        swaps: false,
      },
      themeMode: "dark",
      themeVariables: {
        "--w3m-accent": "#00BFFF",
        "--w3m-border-radius-master": "4px",
        "--w3m-font-family": "Ubiquity Nova, sans-serif",
      },
      // Enable network switching with user confirmation
      enableNetworkView: true,
      enableAccountView: true,
    });

    console.log("✅ Reown AppKit initialized successfully");
    return { appKit, wagmiAdapter };
  } catch (error) {
    console.error("❌ Failed to initialize Reown AppKit:", error);
    return { appKit: null, wagmiAdapter: null };
  }
}


if (typeof window !== "undefined") {
  initializeAppKit();
}

export function getAppKit() {
  return appKit;
}

export { supportedChains };