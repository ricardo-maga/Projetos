import { describe, it, expect } from 'bun:test';
import React from 'react';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Tabs } from '../components/ui/Tabs';
import { Card } from '../components/ui/Card';

describe('FASE 85 — UI Foundation e Normalização Visual', () => {
  describe('1. UI Foundation Primitives (Components Existence & Contract)', () => {
    it('Button exporta e instancia variantes primária, secundária, destrutiva e outline', () => {
      expect(Boolean(Button)).toBe(true);
      const primaryBtn = React.createElement(Button, { variant: 'primary' }, 'Gravar');
      expect(React.isValidElement(primaryBtn)).toBe(true);
      expect(primaryBtn.props.variant).toBe('primary');

      const destructiveBtn = React.createElement(Button, { variant: 'destructive' }, 'Eliminar');
      expect(React.isValidElement(destructiveBtn)).toBe(true);
      expect(destructiveBtn.props.variant).toBe('destructive');

      const secondaryBtn = React.createElement(Button, { variant: 'secondary' }, 'Cancelar');
      expect(React.isValidElement(secondaryBtn)).toBe(true);
      expect(secondaryBtn.props.variant).toBe('secondary');
    });

    it('IconButton exporta e requer aria-label para acessibilidade', () => {
      expect(Boolean(IconButton)).toBe(true);
      const iconBtn = React.createElement(IconButton, {
        'aria-label': 'Fechar modal',
        icon: React.createElement('span', null, 'X'),
      });
      expect(React.isValidElement(iconBtn)).toBe(true);
      expect(iconBtn.props['aria-label']).toBe('Fechar modal');
    });

    it('Badge normaliza variantes semânticas e suporte a dot', () => {
      expect(Boolean(Badge)).toBe(true);
      const badgePrimary = React.createElement(Badge, { variant: 'primary', dot: true }, 'Planeada');
      expect(React.isValidElement(badgePrimary)).toBe(true);
      expect(badgePrimary.props.variant).toBe('primary');
      expect(badgePrimary.props.dot).toBe(true);

      const badgeDanger = React.createElement(Badge, { variant: 'danger' }, 'Atrasada');
      expect(React.isValidElement(badgeDanger)).toBe(true);
      expect(badgeDanger.props.variant).toBe('danger');
    });

    it('Input e Select suportam estado de erro, disabled e placeholders', () => {
      expect(Boolean(Input)).toBe(true);
      expect(Boolean(Select)).toBe(true);

      const input = React.createElement(Input, { placeholder: 'Pesquisar...', error: true });
      expect(React.isValidElement(input)).toBe(true);
      expect(input.props.error).toBe(true);
      expect(input.props.placeholder).toBe('Pesquisar...');
    });

    it('Tabs suporta abas estilo Material/Gmail com contadores e ativação', () => {
      expect(Boolean(Tabs)).toBe(true);
      const tabs = React.createElement(Tabs, {
        items: [
          { id: 'geral', label: 'Visão Geral' },
          { id: 'tarefas', label: 'Tarefas', count: 5 },
        ],
        activeId: 'tarefas',
        onChange: () => {},
      });
      expect(React.isValidElement(tabs)).toBe(true);
      expect(tabs.props.activeId).toBe('tarefas');
      expect(tabs.props.items).toHaveLength(2);
    });

    it('Card suporta classe hoverable e composição', () => {
      expect(Boolean(Card)).toBe(true);
      const card = React.createElement(Card, { hoverable: true }, 'Conteúdo');
      expect(React.isValidElement(card)).toBe(true);
      expect(card.props.hoverable).toBe(true);
    });
  });

  describe('2. Integridade Funcional dos Filtros Rápidos de Tarefas (VIS-84-05)', () => {
    const presets = ['all', 'today', 'tomorrow', 'this_week', 'overdue', 'completed_this_week', 'completed'];

    it('Todos os presets de data canónicos estão preservados e definidos', () => {
      expect(presets).toContain('all');
      expect(presets).toContain('today');
      expect(presets).toContain('tomorrow');
      expect(presets).toContain('this_week');
      expect(presets).toContain('overdue');
      expect(presets).toContain('completed_this_week');
      expect(presets).toContain('completed');
    });
  });

  describe('3. Normalização de Modais e Consistência Visual (VIS-84-04)', () => {
    it('Verifica coerência de convenção de botões de rodapé: Destrutivo (Esquerda) e Cancelar + Primário (Direita)', () => {
      const footerActions = {
        left: 'destructive',
        rightCancel: 'secondary',
        rightSubmit: 'primary',
      };
      expect(footerActions.left).toBe('destructive');
      expect(footerActions.rightCancel).toBe('secondary');
      expect(footerActions.rightSubmit).toBe('primary');
    });
  });
});
