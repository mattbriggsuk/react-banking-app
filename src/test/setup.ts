import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom does not implement the native dialog methods used by the browser.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
    this.querySelector<HTMLButtonElement>('[autofocus]')?.focus()
  }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
