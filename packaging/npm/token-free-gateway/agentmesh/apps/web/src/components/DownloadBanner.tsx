import type React from "react";
import { Download, Monitor, X } from "lucide-react";

interface DownloadBannerProps {
  onClose?: () => void;
}

export const DownloadBanner: React.FC<DownloadBannerProps> = ({ onClose }) => {
  return (
    <div className="download-banner">
      <div className="download-banner-content">
        <Monitor size={18} className="text-amber-400 shrink-0" />
        <div className="download-banner-text">
          <span className="download-banner-title">DaedalOS Desktop</span>
          <span className="download-banner-desc">
            Download the full desktop experience with Bitterbot Agent, AI Engine Monitor, and WebGPU inference
          </span>
        </div>
        <a
          href="https://github.com/koraussie7/MuhanAI/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="download-banner-btn"
        >
          <Download size={14} />
          Download
        </a>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="download-banner-close"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
