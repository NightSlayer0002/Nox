const filterProps = <Props extends Record<string, unknown>>(
  props: Props
): { [P in keyof Props]: Exclude<Props[P], undefined> } => {
  const propsNew: Record<string, unknown> = {}
  const keys = Object.keys(props)

  for (const key of keys) {
    if (props[key] !== undefined) {
      propsNew[key] = props[key]
    }
  }

  return propsNew as { [P in keyof Props]: Exclude<Props[P], undefined> }
}

export { filterProps }
