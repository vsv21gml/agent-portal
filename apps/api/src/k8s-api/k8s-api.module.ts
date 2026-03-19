import { Global, Module } from "@nestjs/common";
import { K8sApiService } from "./k8s-api.service";

@Global()
@Module({
  providers: [K8sApiService],
  exports: [K8sApiService],
})
export class K8sApiModule {}
