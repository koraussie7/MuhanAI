import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage as Page, StatGrid } from "../../components/common/spec";

export function P2pNetworkPage() {
  return (
    <Page
      title="P2P Network"
      subtitle="Old P2P: Share Files → AgentMesh: Share AI Capabilities"
    >
      <StatGrid
        stats={[
          ["Peers", 1284],
          ["Connected", 842],
          ["Searching", 127],
          ["Data", "12.8 TB"],
          ["Compute", "4.2 PFLOPS"],
        ]}
      />
      <p className="dash-note">
        탭: [Peers] [Files] [Models] [Knowledge] [Agents] [Compute] — 구현 진행
        중
      </p>
    </Page>
  );
}

// ---- Compute Mesh ----
