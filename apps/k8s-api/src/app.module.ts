import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { K8sModule } from "./k8s/k8s.module";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), K8sModule],
})
export class AppModule {}
