const IPV4_RE = /(\d{1,3}\.){3}\d{1,3}/;
const IPV6_RE = /([a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}/i;

function extractIps(candidate) {
  const found = [];

  const ipv4 = candidate.match(IPV4_RE);
  if (ipv4) found.push(ipv4[0]);

  const ipv6 = candidate.match(IPV6_RE);
  if (ipv6 && !found.includes(ipv6[0])) found.push(ipv6[0]);

  return found;
}

export function getLocalIps(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!window.RTCPeerConnection) {
      reject(new Error("WebRTC (RTCPeerConnection) недоступен в этом браузере"));
      return;
    }

    const ips = new Set();
    const pc = new RTCPeerConnection({ iceServers: [] });

    const finish = () => {
      pc.onicecandidate = null;
      pc.close();
      resolve([...ips]);
    };

    const timer = setTimeout(finish, timeoutMs);

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        clearTimeout(timer);
        finish();
        return;
      }

      for (const ip of extractIps(event.candidate.candidate)) {
        ips.add(ip);
      }
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
