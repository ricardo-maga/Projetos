'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { Bell, Zap } from 'lucide-react';
import Tabs from '@/components/ui/Tabs';
import { M3SectionHeader } from '@/components/M3';
import NotificationSettingsPanel from '@/components/NotificationSettingsPanel';
import AutomationEditor from './AutomationEditor';

type NotificationProps = ComponentProps<typeof NotificationSettingsPanel>;
type AutomationProps = ComponentProps<typeof AutomationEditor>;

type Props = AutomationProps & {
  activeConfigTab: 'notificacoes' | 'automacoes';
  notificationSettings: NotificationProps['settings'];
  updateNotificationSetting: NotificationProps['updateSetting'];
};

export default function CommunicationSettingsSection({
  activeConfigTab, notificationSettings, updateNotificationSetting, ...automationProps
}: Props) {
  const [notificationTab, setNotificationTab] = useState<'notificacoes' | 'automacoes'>(activeConfigTab);
  useEffect(() => setNotificationTab(activeConfigTab), [activeConfigTab]);

  return <div className="space-y-5">
    <M3SectionHeader title="Notificações e Automações" description="Configure os avisos e as regras automáticas da aplicação." />
    <Tabs
      tabs={[
        { id: 'notificacoes', label: 'Notificações', icon: <Bell className="w-4 h-4" /> },
        { id: 'automacoes', label: 'Automações', icon: <Zap className="w-4 h-4" /> },
      ]}
      activeTabId={notificationTab}
      onChange={tab => setNotificationTab(tab as 'notificacoes' | 'automacoes')}
    />
    {notificationTab === 'notificacoes' && <NotificationSettingsPanel
      settings={notificationSettings}
      canWrite={automationProps.canWrite ?? false}
      updateSetting={updateNotificationSetting}
    />}
    {notificationTab === 'automacoes' && <AutomationEditor {...automationProps} />}
  </div>;
}
