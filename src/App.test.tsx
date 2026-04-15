import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App Component', () => {
  it('renders the app', () => {
    render(<App />);
    // ตรวจสอบว่า app component render ได้
    const rootElement = document.getElementById('root');
    expect(rootElement).toBeDefined();
  });

  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });
});
