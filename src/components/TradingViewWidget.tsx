import React, { useEffect, useRef, memo } from 'react';

const TradingViewWidget: React.FC = () => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const containerEl = container.current;
    if (!containerEl) return;
    // Remove previous embeds (scripts or iframes) on HMR
    containerEl.querySelectorAll('script, iframe').forEach(el => el.remove());
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    // JSON config for TradingView widget
    script.text = JSON.stringify({
      autosize: true,
      symbol: 'PYTH:SOLUSD',
      interval: '1',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      hide_side_toolbar: false,
      allow_symbol_change: false,
      support_host: 'https://www.tradingview.com'
    });
    containerEl.appendChild(script);
  }, []);

  return (
    <div ref={container} className="tradingview-widget-container" style={{ height: '100%', width: '100%' }}>
      <div className="tradingview-widget-container__widget" style={{ height: 'calc(100% - 32px)', width: '100%' }} />
      <div className="tradingview-widget-copyright">
        <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
          <span className="blue-text">Track all markets on TradingView</span>
        </a>
      </div>
    </div>
  );
};

export default memo(TradingViewWidget);