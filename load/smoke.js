import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// k6 load/smoke test for SmartFin v4.
// Run by .github/workflows/load-test.yml (a SEPARATE pipeline from CI/deploy),
// so a slow or failing load test never blocks a release.
//
// VUs and duration are injected by the workflow via --vus / --duration flags;
// the defaults below apply when running locally: `k6 run load/smoke.js`.

const BASE_URL = __ENV.BASE_URL || "https://smartfin-v4.aki-wang.workers.dev";

const errorRate = new Rate("errors");
const homeLatency = new Trend("home_latency_ms");

export const options = {
  vus: 20,
  duration: "1m",
  // Pass/fail gates — these make the run "green/red" so the artifact shows
  // a clear result, and double as documented SLOs for the report.
  thresholds: {
    http_req_failed: ["rate<0.01"],      // <1% of requests may fail
    http_req_duration: ["p(95)<1500"],   // 95% of requests under 1.5s
    errors: ["rate<0.05"],
  },
};

export default function () {
  // Read-only landing page hit — no financial records are created, matching
  // SmartFin's human-confirmed-writes design.
  const res = http.get(`${BASE_URL}/`);

  const ok = check(res, {
    "status is 2xx/3xx": (r) => r.status >= 200 && r.status < 400,
    "body is not empty": (r) => r.body && r.body.length > 0,
  });

  errorRate.add(!ok);
  homeLatency.add(res.timings.duration);

  sleep(1);
}
