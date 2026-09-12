-- Notifications: owners may delete their own rows. Powers the client-side
-- sweep that removes notifications a day after they were opened (read).
CREATE POLICY "notifications_own_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
