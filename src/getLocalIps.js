const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^([a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}$/i;
const MDNS_RE = /\.local$/i;

function isPrivateIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isUsefulAddress(addr) {
  if (!addr) return false;
  if (addr === "0.0.0.0" || addr === "::") return false;
  if (addr === "127.0.0.1" || addr === "::1") return false;
  return true;
}

function classifyAddress(addr) {
  if (IPV4_RE.test(addr)) {
    return isPrivateIPv4(addr) ? "private-ipv4" : "ipv4";
  }
  if (IPV6_RE.test(addr)) return "ipv6";
  if (MDNS_RE.test(addr)) return "mdns";
  return null;
}

function extractHostAddress(event) {
  const candidate = event.candidate;
  if (!candidate) return null;

  const type = candidate.type ?? candidate.candidateType;
  if (type && type !== "host") return null;

  if (candidate.address && isUsefulAddress(candidate.address)) {
    return candidate.address;
  }

  const line = candidate.candidate ?? "";
  if (!line.includes(" typ host ")) return null;

  const address = line.split(" ")[4];
  if (address && isUsefulAddress(address)) return address;

  return null;
}

function sortAddresses(a, b) {
  const order = { "private-ipv4": 0, ipv4: 1, ipv6: 2, mdns: 3 };
  const kindA = classifyAddress(a);
  const kindB = classifyAddress(b);
  return (order[kindA] ?? 9) - (order[kindB] ?? 9);
}

export function getLocalIps(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!window.RTCPeerConnection) {
      reject(new Error("WebRTC (RTCPeerConnection) недоступен в этом браузере"));
      return;
    }

    const ips = new Set();
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceCandidatePoolSize: 1,
    });

    const finish = () => {
      pc.onicecandidate = null;
      pc.close();
      const addresses = [...ips].sort(sortAddresses);
      const hasOnlyMdns =
        addresses.length > 0 && addresses.every((ip) => MDNS_RE.test(ip));

      resolve({ addresses, hasOnlyMdns });
    };

    const timer = setTimeout(finish, timeoutMs);

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        clearTimeout(timer);
        finish();
        return;
      }

      const address = extractHostAddress(event);
      if (address) ips.add(address);
    };

    pc.createDataChannel("probe");

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch((err) => {
        clearTimeout(timer);
        pc.close();
        reject(err);
      });
  });
}
