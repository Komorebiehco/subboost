import { generateClashYaml } from "@subboost/core/generator";
import { stripImportedNodeControlFieldsFromList } from "@subboost/core/subscription/imported-node-controls";
import { resolveNodeNameFilter } from "@subboost/core/subscription/node-name-filter";
import { buildProxyProvidersFromConfig } from "@subboost/core/subscription/proxy-providers";
import type { ParsedNode } from "@subboost/core/types/node";
import type { ConfigState } from "./definitions";

export type GeneratedYamlResult = {
  yaml: string;
  error: string | null;
};

type GenerateClashYamlOptions = Parameters<typeof generateClashYaml>[0];

function formatGeneratedYamlError(error: unknown): string {
  return error instanceof Error ? error.message : "生成配置失败";
}

function buildGenerateClashYamlOptions(
  state: ConfigState,
  proxyProviders: Record<string, unknown> | undefined,
  effectiveNodes: ParsedNode[]
): GenerateClashYamlOptions {
  return {
    nodes: stripImportedNodeControlFieldsFromList(effectiveNodes),
    proxyProviders,
    template: state.template,
    userConfig: {
      enabledGroups: state.enabledProxyGroups,
      enabledRules: state.enabledProxyGroups, // 规则和组现在使用同一列表
      customRules: state.customRules,
      ruleOrder: state.ruleOrder,
      cnIpNoResolve: state.cnIpNoResolve,
      experimentalCnUseCnRuleSet: state.experimentalCnUseCnRuleSet,
      dnsYaml: state.dnsYaml,
      mixedPort: state.mixedPort,
      allowLan: state.allowLan,
      listenerPorts: state.listenerPorts,
      testUrl: state.testUrl,
      testInterval: state.testInterval,
      ruleProviderBaseUrl: state.ruleProviderBaseUrl,
      autoSelectStrategy: "url-test",
    },
    dialerProxyGroups: state.dialerProxyGroups,
    customProxyGroups: state.customProxyGroups,
    customRuleSets: state.customRuleSets,
    builtinRuleEdits: state.builtinRuleEdits,
    proxyGroupAdvanced: state.proxyGroupAdvanced,
    proxyGroupNameOverrides: state.proxyGroupNameOverrides,
    proxyGroupOrder: state.proxyGroupOrder,
    groupListeners: state.groupListeners,
  };
}

export function computeGeneratedYamlResult(state: ConfigState): GeneratedYamlResult {
  const proxyProviders = buildProxyProvidersFromConfig(
    { sources: state.sources },
    { testUrl: state.testUrl, testInterval: state.testInterval }
  );

  try {
    const { effectiveNodes } = resolveNodeNameFilter(state.nodes, state.nodeNameFilter);
    const hasPreviewContent = effectiveNodes.length > 0 || Boolean(proxyProviders);
    const yaml = generateClashYaml(
      buildGenerateClashYamlOptions(state, proxyProviders, effectiveNodes)
    );
    return { yaml: hasPreviewContent ? yaml : "", error: null };
  } catch (error) {
    return { yaml: "", error: formatGeneratedYamlError(error) };
  }
}

export function computeGeneratedYaml(state: ConfigState): string {
  return computeGeneratedYamlResult(state).yaml;
}
