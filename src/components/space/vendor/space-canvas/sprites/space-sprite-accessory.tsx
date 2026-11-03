import React from 'react'
import {
  AGENT_ACCESSORY_SVG,
  agentRoleAccessory,
  resolveAgentRole,
  type AgentRoleId
} from '../core/agent-identity'

export function spriteRoleOf(
  agent: { name?: string | null; role?: string | null } | null | undefined
): AgentRoleId {
  return resolveAgentRole({ name: agent?.name, role: agent?.role })
}

function paint(svg: string, accent: string, weight: number): string {
  const filled = svg.split('{{accent}}').join(accent)
  return weight === 1
    ? filled
    : filled.replace(
        /stroke-width="([\d.]+)"/g,
        (_m, n: string) => `stroke-width="${Number(n) * weight}"`
      )
}

export function SpriteRoleAccessory({
  role,
  layer,
  weight = 1
}: {
  role: AgentRoleId
  layer: 'prop' | 'head'
  weight?: number
}): React.JSX.Element | null {
  const { accessory, accent } = agentRoleAccessory(role)
  const markup = paint(AGENT_ACCESSORY_SVG[accessory][layer], accent, weight)
  return (
    <g
      data-sprite-role={role}
      data-sprite-accessory={`${accessory}:${layer}`}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
