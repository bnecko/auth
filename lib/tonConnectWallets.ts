export type TonConnectWallet = {
  id: string;
  name: string;
  universalLink: string;
  bridgeUrl: string;
};

// Pinned rather than read from the TON Connect registry at
// config.ton.org/wallets-v2.json. Fetching that list would let a third party
// decide at runtime which origins this page talks to, which is exactly what a
// Content-Security-Policy cannot express. The SDK's getWallets() and
// restoreConnection() both perform that fetch, so neither is ever called.
//
// Values are the SDK's own bundled fallback entries for these four wallets.
export const TON_CONNECT_WALLETS: TonConnectWallet[] = [
  {
    id: "tonkeeper",
    name: "Tonkeeper",
    universalLink: "https://app.tonkeeper.com/ton-connect",
    bridgeUrl: "https://bridge.tonapi.io/bridge",
  },
  {
    id: "mytonwallet",
    name: "MyTonWallet",
    universalLink: "https://connect.mytonwallet.org",
    bridgeUrl: "https://tonconnectbridge.mytonwallet.org/bridge/",
  },
  {
    id: "telegram",
    name: "Telegram Wallet",
    universalLink: "https://t.me/wallet?attach=wallet",
    bridgeUrl: "https://walletbot.me/tonconnect-bridge/bridge",
  },
  {
    id: "tonhub",
    name: "Tonhub",
    universalLink: "https://tonhub.com/ton-connect",
    bridgeUrl: "https://connect.tonhubapi.com/tonconnect",
  },
];

// The origins the wallet page opens an event stream to and posts to. A bridge
// is an open relay, so anything able to reach one can post to any session on
// it: these are granted on the single page that needs them and nowhere else.
export const TON_BRIDGE_ORIGINS = Array.from(
  new Set(TON_CONNECT_WALLETS.map(wallet => new URL(wallet.bridgeUrl).origin)),
);
