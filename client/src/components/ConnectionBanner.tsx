interface ConnectionBannerProps {
  connected: boolean;
  retryIn: number | null;
}

export function ConnectionBanner({ connected, retryIn }: ConnectionBannerProps) {
  if (connected) return null;

  return (
    <div className="connection-banner">
      Disconnected — reconnecting{retryIn !== null ? ` in ${retryIn}s` : ''}...
    </div>
  );
}
