import type { ParameterCatalogDefinition } from "./catalog";

export function getAdvancedDefinitions(
  activeOptionalDefinitions: readonly ParameterCatalogDefinition[],
  optionalDefinitions: readonly ParameterCatalogDefinition[],
  addedOptionalParameterNames: readonly string[]
) {
  const advancedDefinitionNames = new Set([
    ...activeOptionalDefinitions.map((definition) => definition.name),
    ...addedOptionalParameterNames
  ]);

  return optionalDefinitions.filter((definition) => advancedDefinitionNames.has(definition.name));
}

export function filterAdvancedDefinitions(
  optionalDefinitions: readonly ParameterCatalogDefinition[],
  advancedDefinitions: readonly ParameterCatalogDefinition[],
  query: string
) {
  const advancedDefinitionNames = new Set(advancedDefinitions.map((definition) => definition.name));
  const normalizedQuery = query.trim().toLowerCase();

  return optionalDefinitions.filter(
    (definition) =>
      !advancedDefinitionNames.has(definition.name) &&
      matchesAdvancedDefinitionQuery(definition, normalizedQuery)
  );
}

export function getAdvancedPickerEmptyMessage(
  optionalDefinitions: readonly ParameterCatalogDefinition[],
  advancedDefinitions: readonly ParameterCatalogDefinition[],
  query: string
) {
  if (optionalDefinitions.length === 0) {
    return "이 리소스 타입에는 optional 파라미터가 없습니다.";
  }

  if (query.trim().length > 0) {
    return "검색 결과가 없습니다.";
  }

  if (advancedDefinitions.length >= optionalDefinitions.length) {
    return "모든 optional 파라미터가 추가되었습니다.";
  }

  return "추가할 optional 파라미터가 없습니다.";
}

export function removeAdvancedParameterValue(
  values: Record<string, unknown>,
  parameterName: string
) {
  const nextValues = { ...values };
  delete nextValues[parameterName];
  return nextValues;
}

function matchesAdvancedDefinitionQuery(
  definition: ParameterCatalogDefinition,
  normalizedQuery: string
) {
  if (!normalizedQuery) {
    return true;
  }

  return [
    definition.name,
    definition.terraformName,
    definition.label,
    definition.description ?? ""
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}
