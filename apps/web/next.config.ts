import type { NextConfig } from "next";
import dotenv from "dotenv";
import path from "node:path";

const rootEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: rootEnvPath });

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
