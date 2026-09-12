-- Seller-replied notifications: writing a chat message inserts a
-- notification for the recipient. SECURITY DEFINER so the trigger can read
-- the conversation and write the notification regardless of RLS direction.

CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_buyer uuid;
  v_seller uuid;
  v_recipient uuid;
  v_store_name text;
  v_title text;
BEGIN
  IF NEW.kind NOT IN ('text', 'image') THEN
    RETURN NEW;
  END IF;

  SELECT buyer_id, seller_id INTO v_buyer, v_seller
  FROM public.conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_recipient := CASE WHEN NEW.sender_id = v_buyer THEN v_seller ELSE v_buyer END;
  IF v_recipient IS NULL OR v_recipient = NEW.sender_id THEN RETURN NEW; END IF;

  SELECT s.name INTO v_store_name FROM public.stores s WHERE s.id = (
    SELECT store_id FROM public.conversations WHERE id = NEW.conversation_id
  );

  v_title := CASE
    WHEN NEW.sender_id = v_buyer THEN COALESCE(v_store_name, 'New message')
    ELSE 'New buyer message'
  END;

  INSERT INTO public.notifications (user_id, kind, title, body, payload)
  VALUES (
    v_recipient,
    'message',
    v_title,
    CASE WHEN NEW.kind = 'image' THEN '📷 Photo' ELSE left(COALESCE(NEW.body, ''), 120) END,
    jsonb_build_object('conversation_id', NEW.conversation_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_message ON public.messages;
CREATE TRIGGER trg_notify_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();
