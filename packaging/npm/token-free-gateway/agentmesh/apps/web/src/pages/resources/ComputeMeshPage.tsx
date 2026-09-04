import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage as Page, StatGrid } from "../../components/common/spec";

export function ComputeMeshPage() {
  return (
    <Page title="Compute Mesh" subtitle="Share Compute → +300 Credits/day">
      <StatGrid
        stats={[
          ["CPU", 8421],
          ["GPU", 1823],
          ["WebGPU", 4921],
          ["Total", "128.4 TFLOPS"],
        ]}
      />
    </Page>
  );
}

// ---- Marketplace ----
