import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TabContextMenu } from '../components/TabContextMenu.js';

describe('TabContextMenu', () => {
  const defaultProps = {
    x: 100,
    y: 200,
    sessionId: 'session-1',
    paneId: 'pane-0',
    isSettings: false,
    onRename: vi.fn(),
    onClose: vi.fn(),
    onSplitRight: vi.fn(),
    onSplitLeft: vi.fn(),
    onSplitDown: vi.fn(),
    onSplitUp: vi.fn(),
    onDismiss: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all menu items for terminal tabs', () => {
    const { getByText } = render(<TabContextMenu {...defaultProps} />);

    expect(getByText('Rename')).toBeTruthy();
    expect(getByText('Close')).toBeTruthy();
    expect(getByText('Split Right')).toBeTruthy();
    expect(getByText('Split Left')).toBeTruthy();
    expect(getByText('Split Down')).toBeTruthy();
    expect(getByText('Split Up')).toBeTruthy();
  });

  it('renders only Close for settings tabs', () => {
    const { getByText, queryByText } = render(
      <TabContextMenu {...defaultProps} isSettings={true} />
    );

    expect(getByText('Close')).toBeTruthy();
    expect(queryByText('Rename')).toBeNull();
    expect(queryByText('Split Right')).toBeNull();
  });

  it('calls onRename when Rename is clicked', () => {
    const { getByText } = render(<TabContextMenu {...defaultProps} />);
    fireEvent.click(getByText('Rename'));
    expect(defaultProps.onRename).toHaveBeenCalled();
  });

  it('calls onClose when Close is clicked', () => {
    const { getByText } = render(<TabContextMenu {...defaultProps} />);
    fireEvent.click(getByText('Close'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onSplitRight when Split Right is clicked', () => {
    const { getByText } = render(<TabContextMenu {...defaultProps} />);
    fireEvent.click(getByText('Split Right'));
    expect(defaultProps.onSplitRight).toHaveBeenCalled();
  });

  it('calls onSplitLeft when Split Left is clicked', () => {
    const { getByText } = render(<TabContextMenu {...defaultProps} />);
    fireEvent.click(getByText('Split Left'));
    expect(defaultProps.onSplitLeft).toHaveBeenCalled();
  });

  it('calls onSplitDown when Split Down is clicked', () => {
    const { getByText } = render(<TabContextMenu {...defaultProps} />);
    fireEvent.click(getByText('Split Down'));
    expect(defaultProps.onSplitDown).toHaveBeenCalled();
  });

  it('calls onSplitUp when Split Up is clicked', () => {
    const { getByText } = render(<TabContextMenu {...defaultProps} />);
    fireEvent.click(getByText('Split Up'));
    expect(defaultProps.onSplitUp).toHaveBeenCalled();
  });

  it('calls onDismiss when clicking outside', () => {
    render(<TabContextMenu {...defaultProps} />);
    fireEvent.mouseDown(document);
    expect(defaultProps.onDismiss).toHaveBeenCalled();
  });

  it('calls onDismiss when Escape is pressed', () => {
    render(<TabContextMenu {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onDismiss).toHaveBeenCalled();
  });

  it('positions the menu at the specified coordinates', () => {
    const { container } = render(<TabContextMenu {...defaultProps} />);
    const menu = container.querySelector('.context-menu') as HTMLElement;
    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('200px');
  });
});
