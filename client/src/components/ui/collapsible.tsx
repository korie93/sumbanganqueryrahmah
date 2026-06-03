"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

/**
 * Renders the shared collapsible component used across SQR screens.
 */
const Collapsible = CollapsiblePrimitive.Root

/**
 * Renders the collapsible trigger control for its companion surface.
 */
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

/**
 * Renders the collapsible content surface with standard SQR layout behavior.
 */
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
