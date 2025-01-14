import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { select, openMenu } from 'react-select-event';

import * as grafanaRuntime from '@grafana/runtime';
import * as ui from '@grafana/ui';

import createMockDatasource from '../../__mocks__/datasource';
import { AzureMonitorQuery, AzureQueryType } from '../../types';

import VariableEditor from './VariableEditor';

// Have to mock CodeEditor because it doesnt seem to work in tests???
jest.mock('@grafana/ui', () => ({
  ...jest.requireActual<typeof ui>('@grafana/ui'),
  CodeEditor: function CodeEditor({ value, onSave }: { value: string; onSave: (newQuery: string) => void }) {
    return <input data-testid="mockeditor" value={value} onChange={(event) => onSave(event.target.value)} />;
  },
}));

const defaultProps = {
  query: {
    refId: 'A',
    queryType: AzureQueryType.LogAnalytics,
    azureLogAnalytics: {
      query: 'test query',
    },
    subscription: 'id',
  },
  onChange: jest.fn(),
  datasource: createMockDatasource(),
};

const originalConfigValue = grafanaRuntime.config.featureToggles.azTemplateVars;
beforeEach(() => {
  // reset config
  grafanaRuntime.config.featureToggles.azTemplateVars = originalConfigValue;
});

describe('VariableEditor:', () => {
  it('can select a query type', async () => {
    const onChange = jest.fn();
    const { rerender } = render(<VariableEditor {...defaultProps} onChange={onChange} />);
    await waitFor(() => screen.getByLabelText('select query type'));
    expect(screen.getByLabelText('select query type')).toBeInTheDocument();
    screen.getByLabelText('select query type').click();
    await select(screen.getByLabelText('select query type'), 'Grafana Query Function', {
      container: document.body,
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        queryType: AzureQueryType.GrafanaTemplateVariableFn,
      })
    );
    const newQuery = onChange.mock.calls.at(-1)[0];
    rerender(<VariableEditor {...defaultProps} query={newQuery} />);
    expect(screen.queryByText('Logs')).not.toBeInTheDocument();
    expect(screen.queryByText('Grafana Query Function')).toBeInTheDocument();
  });
  describe('log queries:', () => {
    it('should render', async () => {
      render(<VariableEditor {...defaultProps} />);
      await waitFor(() => screen.queryByTestId('mockeditor'));
      expect(screen.queryByText('Resource')).toBeInTheDocument();
      expect(screen.queryByTestId('mockeditor')).toBeInTheDocument();
    });

    it('should call on change if the query changes', async () => {
      const onChange = jest.fn();
      render(<VariableEditor {...defaultProps} onChange={onChange} />);
      await waitFor(() => screen.queryByTestId('mockeditor'));
      expect(screen.queryByTestId('mockeditor')).toBeInTheDocument();
      await userEvent.type(screen.getByTestId('mockeditor'), '{backspace}');
      expect(onChange).toHaveBeenCalledWith({
        azureLogAnalytics: {
          query: 'test quer',
        },
        queryType: 'Azure Log Analytics',
        refId: 'A',
        subscription: 'id',
      });
    });
  });

  describe('grafana template variable fn queries:', () => {
    it('should render', async () => {
      const props = {
        ...defaultProps,
        query: {
          refId: 'A',
          queryType: AzureQueryType.GrafanaTemplateVariableFn,
          grafanaTemplateVariableFn: {
            rawQuery: 'test query',
            kind: 'SubscriptionsQuery',
          },
          subscription: 'id',
        } as AzureMonitorQuery,
      };
      render(<VariableEditor {...props} />);
      await waitFor(() => screen.queryByText('Grafana template variable function'));
      expect(screen.queryByText('Grafana template variable function')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('test query')).toBeInTheDocument();
    });

    it('should call on change if the query changes', async () => {
      const props = {
        ...defaultProps,
        query: {
          refId: 'A',
          queryType: AzureQueryType.GrafanaTemplateVariableFn,
          grafanaTemplateVariableFn: {
            rawQuery: 'Su',
            kind: 'UnknownQuery',
          },
          subscription: 'subscriptionId',
        } as AzureMonitorQuery,
      };
      render(<VariableEditor {...props} />);
      await waitFor(() => screen.queryByText('Grafana template variable function'));
      await userEvent.type(screen.getByDisplayValue('Su'), 'bscriptions()');
      expect(screen.getByDisplayValue('Subscriptions()')).toBeInTheDocument();
      screen.getByDisplayValue('Subscriptions()').blur();
      await waitFor(() => screen.queryByText('None'));
      expect(props.onChange).toHaveBeenCalledWith({
        refId: 'A',
        queryType: AzureQueryType.GrafanaTemplateVariableFn,
        grafanaTemplateVariableFn: {
          rawQuery: 'Subscriptions()',
          kind: 'SubscriptionsQuery',
        },
        subscription: 'subscriptionId',
      });
    });
  });

  describe('predefined queries:', () => {
    it('should show the new query types if feature gate is enabled', async () => {
      grafanaRuntime.config.featureToggles.azTemplateVars = true;
      render(<VariableEditor {...defaultProps} />);
      openMenu(screen.getByLabelText('select query type'));
      await waitFor(() => expect(screen.getByText('Subscriptions')).toBeInTheDocument());
    });

    it('should not show the new query types if feature gate is disabled', async () => {
      grafanaRuntime.config.featureToggles.azTemplateVars = false;
      render(<VariableEditor {...defaultProps} />);
      openMenu(screen.getByLabelText('select query type'));
      await waitFor(() => expect(screen.queryByText('Subscriptions')).not.toBeInTheDocument());
    });

    it('should run the query if requesting subscriptions', async () => {
      grafanaRuntime.config.featureToggles.azTemplateVars = true;
      const onChange = jest.fn();
      const { rerender } = render(<VariableEditor {...defaultProps} onChange={onChange} />);
      openMenu(screen.getByLabelText('select query type'));
      screen.getByText('Subscriptions').click();
      // Simulate onChange behavior
      const newQuery = onChange.mock.calls.at(-1)[0];
      rerender(<VariableEditor {...defaultProps} query={newQuery} onChange={onChange} />);
      await waitFor(() => expect(screen.getByText('Subscriptions')).toBeInTheDocument());
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ queryType: AzureQueryType.SubscriptionsQuery, refId: 'A' })
      );
    });

    it('should run the query if requesting resource groups', async () => {
      grafanaRuntime.config.featureToggles.azTemplateVars = true;
      const ds = createMockDatasource({
        getSubscriptions: jest.fn().mockResolvedValue([{ text: 'Primary Subscription', value: 'sub' }]),
      });
      const onChange = jest.fn();
      const { rerender } = render(<VariableEditor {...defaultProps} onChange={onChange} datasource={ds} />);
      // wait for initial load
      await waitFor(() => expect(screen.getByText('Logs')).toBeInTheDocument());
      // Select RGs variable
      openMenu(screen.getByLabelText('select query type'));
      screen.getByText('Resource Groups').click();
      // Simulate onChange behavior
      const newQuery = onChange.mock.calls.at(-1)[0];
      rerender(<VariableEditor {...defaultProps} query={newQuery} onChange={onChange} />);
      await waitFor(() => expect(screen.getByText('Select subscription')).toBeInTheDocument());
      // Select a subscription
      openMenu(screen.getByLabelText('select subscription'));
      screen.getByText('Primary Subscription').click();
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          queryType: AzureQueryType.ResourceGroupsQuery,
          subscription: 'sub',
          refId: 'A',
        })
      );
    });

    it('should show template variables as options ', async () => {
      const onChange = jest.fn();
      grafanaRuntime.config.featureToggles.azTemplateVars = true;
      const ds = createMockDatasource({
        getSubscriptions: jest.fn().mockResolvedValue([{ text: 'Primary Subscription', value: 'sub' }]),
        getVariablesRaw: jest.fn().mockReturnValue([
          { label: 'query0', name: 'sub0' },
          { label: 'query1', name: 'rg', query: { queryType: AzureQueryType.ResourceGroupsQuery } },
        ]),
      });
      const { rerender } = render(<VariableEditor {...defaultProps} datasource={ds} onChange={onChange} />);
      // wait for initial load
      await waitFor(() => expect(screen.getByText('Logs')).toBeInTheDocument());
      // Select RGs variable
      openMenu(screen.getByLabelText('select query type'));
      screen.getByText('Resource Groups').click();
      // Simulate onChange behavior
      const newQuery = onChange.mock.calls.at(-1)[0];
      rerender(<VariableEditor {...defaultProps} query={newQuery} onChange={onChange} datasource={ds} />);
      await waitFor(() => expect(screen.getByText('Select subscription')).toBeInTheDocument());
      // Select a subscription
      openMenu(screen.getByLabelText('select subscription'));
      await waitFor(() => expect(screen.getByText('Primary Subscription')).toBeInTheDocument());
      screen.getByText('Template Variables').click();
      // Simulate onChange behavior
      const lastQuery = onChange.mock.calls.at(-1)[0];
      rerender(<VariableEditor {...defaultProps} query={lastQuery} onChange={onChange} datasource={ds} />);
      await waitFor(() => expect(screen.getByText('query0')).toBeInTheDocument());
      // Template variables of the same type than the current one should not appear
      expect(screen.queryByText('query1')).not.toBeInTheDocument();
    });
  });
});
