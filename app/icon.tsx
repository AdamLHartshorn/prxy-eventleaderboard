import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#000000",
          border: "28px solid #E53935",
          color: "#ffffff",
          display: "flex",
          fontSize: 104,
          fontWeight: 900,
          height: "100%",
          justifyContent: "center",
          letterSpacing: 0,
          width: "100%",
        }}
      >
        PRXY
      </div>
    ),
    {
      ...size,
    },
  );
}
