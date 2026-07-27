import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// O cleanup automático do Testing Library depende de um `afterEach` GLOBAL, que
// só existe com `globals: true` — e a config não liga globals. Sem isto, cada
// render fica no document e as queries do `screen` passam a encontrar elementos
// do teste anterior ("Found multiple elements…"), ou pior, passam por engano
// olhando para a árvore errada.
afterEach(cleanup)
