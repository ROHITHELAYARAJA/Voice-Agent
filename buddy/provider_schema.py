from copy import deepcopy


def tool_schema(schema: dict, provider: str) -> dict:
    if provider != "google":
        return deepcopy(schema)
    definitions = schema.get("$defs", {})
    supported = {"type", "description", "enum", "properties", "items", "required"}

    def convert(value):
        if "$ref" in value:
            value = definitions[value["$ref"].split("/")[-1]]
        if "anyOf" in value:
            choices = [item for item in value["anyOf"] if item.get("type") != "null"]
            chosen = next((item for item in choices if item.get("type") == "string"), choices[0])
            result = convert(chosen)
            if len(choices) != len(value["anyOf"]):
                result["nullable"] = True
            return result
        result = {key: deepcopy(item) for key, item in value.items() if key in supported}
        if "properties" in result:
            result["properties"] = {
                key: convert(item) for key, item in result["properties"].items()
            }
        if "items" in result:
            result["items"] = convert(result["items"])
        return result

    return convert(schema)
