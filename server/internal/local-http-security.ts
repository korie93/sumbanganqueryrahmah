import type { Express } from "express";
import helmet from "helmet";
import { runtimeConfig } from "../config/runtime";
import { SQR_TRUSTED_TYPES_POLICY_NAME } from "../../shared/trusted-types";

export const CSP_REPORT_ENDPOINT_PATH = "/api/csp-report";
const CSP_REPORT_GROUP = "sqr-csp-endpoint";
const CSP_REPORT_TO_VALUE = JSON.stringify({
  group: CSP_REPORT_GROUP,
  max_age: 10_886_400,
  endpoints: [{ url: CSP_REPORT_ENDPOINT_PATH }],
});
const CSP_REPORTING_ENDPOINTS_VALUE = `${CSP_REPORT_GROUP}="${CSP_REPORT_ENDPOINT_PATH}"`;

export const REACT_REMOVE_SCROLL_BAR_STYLE_HASHES = [
  "'sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo='",
  "'sha256-yMyGHLLNy9ZXD5cfUANqBnMLxrInc0Xt5wSlgMO77gw='",
  "'sha256-EiVtJtqdjayp2TNkfjKatvHj6zqWKFlCtnKhLaNh+6Y='",
  "'sha256-nMmTtq6jjPmcn3M5mOS+FT7/i5KoRJswjrJI3b/spqQ='",
  "'sha256-AqM6/p13H6JF8ug6zt9Yy7+E9CrBKhGKvN4vJoz71t4='",
  "'sha256-tBpHYumZRC8NnarTegNJ4u4soXWNUtbRChh+6GCVlAE='",
  "'sha256-euE++7UNifzFwUnt97ux0ifFe8aO1lAO54MdyHRBk7s='",
  "'sha256-L6iv6LS6TPj0jNGj8t0Egmh+mXLCQcYpS1CLyFzuEhY='",
  "'sha256-bhKU60izCFLtZFtzA8u3NqR8ZtM/OsML9i+YcHfci8Q='",
  "'sha256-upk5qFSfWikoQ3NraC1DKwhHGoyVAmafisgpmR12Ulw='",
  "'sha256-XReiwjORRzqabGyv2ayyS+6pOG3pMi9VCy3dwX6vmjI='",
  "'sha256-CYQvm9FImp+2UIm3YYS2mta1GLoWribsg8cvl/93QlE='",
  "'sha256-Nu5PeqEkabAbacGGO5j4Yw6GACSnF8ny/ZJwrD4Usz8='",
  "'sha256-um/BVKLkLjh79PZ3seMJ2w5BSEiq2HzhgD/CDFRAKGc='",
  "'sha256-9d6zh832P8CUus1kLkDwBKiQmtT4Js6POR3/xYWrXIs='",
  "'sha256-kAApudxpTi9mfjlC9lC8ZaS9xFHU9/NLLbB173MU7SU='",
  "'sha256-AMd96FJ0GSrxFtEVT53SsztnJlpK57ZkVSOwhrM6Jjg='",
  "'sha256-Q9MUdYBtYzn5frLpoNRLdFYW76cJ4ok2SmIKzTFq57Q='",
  "'sha256-FO9bpi1QCp3bkmNPI0U0vFVx2AwGeeID2YKsSVhEt50='",
  "'sha256-v/DJOcxAWixzP4/crWlagosxg7zwkscezgM94iYZsyY='",
  "'sha256-FrgwzD65SPHF5VyQMJIY0x1JLTnjX8h7V53j5bXLXRE='",
  "'sha256-rpSiGpxmFMo2lQn9HH5WKULoKZ7xvWhUwvgpiRkyTAY='",
  "'sha256-QyI7MPvZeMqJcDA5iD+PgK04sLah6CcuMVp5AVrSvlk='",
  "'sha256-zOMd0cB6s97lKvLWq3a1quL43ZNcWnYISwV24T8QfL0='",
  "'sha256-44LYAc7BwsowSCKEIjNptfewBms/mS8PLOYIq2EHitc='",
  "'sha256-I7KXGhO7gNfZgoAsk2nYeOeCSAbzw1zpJRhVldz/xkU='",
  "'sha256-rUZ+xPT61Z7s79t2TUk+ch3xOQP2kE3wwp4Iyzliuxw='",
  "'sha256-CcN4tD0mSaUZckZIwsuFk01CppQv+aXK07TYmjGXu8Q='",
  "'sha256-duEBVPeKIq266BrQyfCgm49HkZ10yvWWSf1BgX7vmMs='",
  "'sha256-ije6BO59LnJw0dmXdwoEU/lmitsR5WuhL3+PQG/J0Cw='",
  "'sha256-gxdR88Pf6XnTPKFwHTuQk3EIoquqtZWGvJ9PhLdJg20='",
];

const PERMISSIONS_POLICY_HEADER = [
  "accelerometer=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "screen-wake-lock=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

export function registerLocalHttpSecurityHeaders(app: Express) {
  app.disable("x-powered-by");

  app.use(helmet({
    crossOriginOpenerPolicy: {
      policy: "same-origin",
    },
    frameguard: {
      action: "sameorigin",
    },
    referrerPolicy: {
      policy: "no-referrer",
    },
    hsts: {
      // HSTS preload remains opt-in because it requires verified HTTPS
      // coverage for every production subdomain before registry submission.
      ...runtimeConfig.app.securityHeaders.hsts,
    },
    noSniff: true,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        frameSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'"],
        // Radix modal/dropdown primitives use react-remove-scroll-bar to
        // inject deterministic scroll-lock CSS. Keep CSP strict by allowing
        // only those hashes instead of reopening style-src-elem unsafe-inline.
        styleSrcElem: ["'self'", ...REACT_REMOVE_SCROLL_BAR_STYLE_HASHES],
        styleSrcAttr: ["'none'"],
        trustedTypes: ["default", SQR_TRUSTED_TYPES_POLICY_NAME],
        "require-trusted-types-for": ["'script'"],
        reportUri: [CSP_REPORT_ENDPOINT_PATH],
        reportTo: [CSP_REPORT_GROUP],
      },
    },
  }));

  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", PERMISSIONS_POLICY_HEADER);
    res.setHeader("Report-To", CSP_REPORT_TO_VALUE);
    res.setHeader("Reporting-Endpoints", CSP_REPORTING_ENDPOINTS_VALUE);
    next();
  });
}
