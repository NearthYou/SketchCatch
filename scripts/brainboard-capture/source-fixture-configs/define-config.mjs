export function defineFixtureBatch(fixtures) {
  return fixtures;
}

export function resource(address, fileName, addressMapping) {
  return { kind: "resource", address, fileName, addressMapping };
}

export function presentation(catalogId, aliasOf = null, style = null) {
  return { kind: "presentation", catalogId, aliasOf, style };
}
