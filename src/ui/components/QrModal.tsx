import { encode, renderSVG } from "uqr";
import { Modal } from "./ui";
import { Icon } from "./Icon";

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

export function QrModal({ url, slug, onClose }: { url: string; slug: string; onClose: () => void }) {
  const svg = renderSVG(url, { border: 2, ecc: "M" });

  const png = () => {
    const { data, size } = encode(url, { border: 2, ecc: "M" });
    const scale = Math.ceil(1024 / size);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    data.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(x * scale, y * scale, scale, scale)));
    download(canvas.toDataURL("image/png"), `${slug}-qr.png`);
  };

  return (
    <Modal
      title="QR code"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button class="btn" onClick={() => download(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), `${slug}-qr.svg`)}>
            <Icon name="download" size={14} /> SVG
          </button>
          <button class="btn btn-primary" onClick={png}>
            <Icon name="download" size={14} /> PNG
          </button>
        </>
      }
    >
      <div class="qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <p style="margin:0;text-align:center;color:var(--muted)" class="mono">{url.replace(/^https?:\/\//, "")}</p>
    </Modal>
  );
}
